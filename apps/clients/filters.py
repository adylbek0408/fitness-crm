import django_filters
from django.db.models import Q, F, Sum, Subquery, Value, DecimalField
from django.db.models.functions import Coalesce
from decimal import Decimal

from .models import Client
from apps.payments.models import InstallmentPlan


class ClientFilter(django_filters.FilterSet):
    group = django_filters.UUIDFilter(field_name='group__id')
    trainer = django_filters.CharFilter(method='filter_trainer')
    registered_by = django_filters.CharFilter(method='filter_registered_by')
    status = django_filters.CharFilter(method='filter_status')
    client_type = django_filters.CharFilter(field_name='client_type')
    training_format = django_filters.CharFilter(method='filter_training_format')
    group_type = django_filters.ChoiceFilter(choices=Client.GROUP_TYPE_CHOICES)
    is_repeat = django_filters.BooleanFilter()
    registered_from = django_filters.DateFilter(field_name='registered_at', lookup_expr='gte')
    registered_to = django_filters.DateFilter(field_name='registered_at', lookup_expr='lte')
    payment_status = django_filters.ChoiceFilter(
        choices=[('', 'Все'), ('paid', 'Оплатили полностью'), ('unpaid', 'Есть остаток')],
        method='filter_payment_status'
    )
    from_telegram = django_filters.ChoiceFilter(
        choices=[('', 'Все'), ('yes', 'Из Telegram'), ('no', 'Обычные')],
        method='filter_from_telegram'
    )
    # Фильтр по подписке онлайн-группы (online_subscription_tags)
    online_subscription = django_filters.CharFilter(method='filter_online_subscription')

    class Meta:
        model = Client
        fields = [
            'group', 'trainer', 'status', 'client_type', 'training_format',
            'group_type', 'is_repeat', 'online_subscription',
        ]

    def filter_status(self, queryset, name, value):
        if not value:
            return queryset
        return queryset.filter(status=value)

    def filter_training_format(self, queryset, name, value):
        """
        online  → primary online OR has active parallel enrollment in online group
        offline → primary offline OR has active parallel enrollment in offline group
        mixed   → has BOTH online AND offline groups (primary + parallel combined)
        """
        if not value:
            return queryset
        from django.db.models import Exists, OuterRef
        from .models import ClientEnrollment

        parallel_online = Exists(
            ClientEnrollment.objects.filter(
                client=OuterRef('pk'), is_active=True, group__training_format='online'
            )
        )
        parallel_offline = Exists(
            ClientEnrollment.objects.filter(
                client=OuterRef('pk'), is_active=True, group__training_format='offline'
            )
        )

        has_online  = Q(training_format='online')  | parallel_online
        has_offline = Q(training_format='offline') | parallel_offline

        if value == 'mixed':
            return queryset.filter(has_online & has_offline)
        if value == 'online':
            return queryset.filter(has_online)
        if value == 'offline':
            return queryset.filter(has_offline)
        return queryset.filter(training_format=value)

    def filter_trainer(self, queryset, name, value):
        """
        Фильтрует по тренеру: проверяет как client.trainer,
        так и client.group.trainer — на случай если trainer на клиенте
        не был обновлён при смене тренера в группе.
        """
        if not value:
            return queryset
        try:
            import uuid
            uuid.UUID(str(value))
        except (ValueError, AttributeError):
            return queryset.none()
        return queryset.filter(
            Q(trainer__id=value) | Q(group__trainer__id=value)
        ).distinct()

    def filter_online_subscription(self, queryset, name, value):
        """
        Фильтрует клиентов у которых группа содержит
        заданный тег подписки в online_subscription_tags.
        """
        if not value:
            return queryset
        return queryset.filter(
            group__online_subscription_tags__contains=[value]
        )

    def filter_from_telegram(self, queryset, name, value):
        if not value:
            return queryset
        if value == 'yes':
            return queryset.exclude(telegram_link='').exclude(telegram_link__isnull=True)
        if value == 'no':
            return queryset.filter(Q(telegram_link='') | Q(telegram_link__isnull=True))
        return queryset

    def filter_registered_by(self, queryset, name, value):
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
