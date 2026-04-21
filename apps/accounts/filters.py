import django_filters
from django.db.models import Q

from apps.accounts.models import ManagerProfile


class ManagerFilter(django_filters.FilterSet):
    """
    Фильтры для списка менеджеров:
      - q: поиск по ФИО / username / phone
      - created_from, created_to: по дате регистрации аккаунта (user.date_joined)
    """
    q = django_filters.CharFilter(method='filter_q')
    created_from = django_filters.DateFilter(field_name='user__date_joined', lookup_expr='date__gte')
    created_to = django_filters.DateFilter(field_name='user__date_joined', lookup_expr='date__lte')
    is_active = django_filters.BooleanFilter(field_name='user__is_active')

    class Meta:
        model = ManagerProfile
        fields = []

    def filter_q(self, queryset, name, value):
        if not value:
            return queryset
        v = str(value).strip()
        if not v:
            return queryset
        return queryset.filter(
            Q(first_name__icontains=v)
            | Q(last_name__icontains=v)
            | Q(phone__icontains=v)
            | Q(user__username__icontains=v)
        ).distinct()
