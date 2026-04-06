import django_filters
from django.db.models import Q, F, Sum, Subquery, Value, DecimalField
from django.db.models.functions import Coalesce
from decimal import Decimal

from .models import Client
from apps.payments.models import InstallmentPlan


class ClientFilter(django_filters.FilterSet):
    group = django_filters.UUIDFilter(field_name='group__id')
    trainer = django_filters.UUIDFilter(field_name='trainer__id')
    # UUID пользователя менеджера: по FK + по снимку ФИО (как при create_client:
    # у части клиентов registered_by может указывать на общий аккаунт, а ФИО — в registered_by_name)
    registered_by = django_filters.CharFilter(method='filter_registered_by')
    status = django_filters.ChoiceFilter(choices=Client.STATUS_CHOICES)
    training_format = django_filters.ChoiceFilter(choices=Client.TRAINING_FORMAT_CHOICES)
    group_type = django_filters.ChoiceFilter(choices=Client.GROUP_TYPE_CHOICES)
    is_repeat = django_filters.BooleanFilter()
    registered_from = django_filters.DateFilter(field_name='registered_at', lookup_expr='gte')
    registered_to = django_filters.DateFilter(field_name='registered_at', lookup_expr='lte')
    payment_status = django_filters.ChoiceFilter(
        choices=[('', 'Все'), ('paid', 'Оплатили полностью'), ('unpaid', 'Есть остаток')],
        method='filter_payment_status'
    )

    class Meta:
        model = Client
        # registered_by задан вручную (filter_registered_by), не дублировать в fields
        fields = ['group', 'trainer', 'status', 'training_format', 'group_type', 'is_repeat']

    def filter_registered_by(self, queryset, name, value):
        """
        Параметр registered_by — PK пользователя-менеджера (int или UUID, не только UUID).
        Совпадение: FK registered_by ИЛИ снимок ФИО «Фамилия Имя» как в create_client.
        """
        if value is None or str(value).strip() == '':
            return queryset
        raw = str(value).strip()

        from django.contrib.auth import get_user_model
        from apps.accounts.models import ManagerProfile

        User = get_user_model()
        try:
            mgr_user = User.objects.get(pk=raw)
        except (User.DoesNotExist, ValueError, TypeError):
            return queryset.none()

        mp = ManagerProfile.objects.filter(user_id=mgr_user.pk).select_related('user').first()
        if mp:
            snap = f'{mp.last_name} {mp.first_name}'.strip()
            if snap:
                return queryset.filter(
                    Q(registered_by_id=mgr_user.pk) | Q(registered_by_name__iexact=snap),
                ).distinct()

        return queryset.filter(registered_by_id=mgr_user.pk)

    def filter_payment_status(self, queryset, name, value):
        if not value:
            return queryset
        installment_paid = InstallmentPlan.objects.annotate(
            total_paid_sum=Coalesce(Sum('payments__amount'), Value(Decimal('0')), output_field=DecimalField())
        ).filter(total_paid_sum__gte=F('total_cost')).values('client_id')
        if value == 'paid':
            return queryset.filter(
                Q(full_payments__is_paid=True) | Q(id__in=Subquery(installment_paid))
            ).distinct()
        if value == 'unpaid':
            return queryset.exclude(
                Q(full_payments__is_paid=True) | Q(id__in=Subquery(installment_paid))
            )
        return queryset
