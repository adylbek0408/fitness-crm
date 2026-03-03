import django_filters

from .models import Client


class ClientFilter(django_filters.FilterSet):
    group = django_filters.UUIDFilter(field_name='group__id')
    trainer = django_filters.UUIDFilter(field_name='trainer__id')
    status = django_filters.ChoiceFilter(choices=Client.STATUS_CHOICES)
    training_format = django_filters.ChoiceFilter(choices=Client.TRAINING_FORMAT_CHOICES)
    group_type = django_filters.ChoiceFilter(choices=Client.GROUP_TYPE_CHOICES)
    is_repeat = django_filters.BooleanFilter()
    registered_from = django_filters.DateFilter(field_name='registered_at', lookup_expr='gte')
    registered_to = django_filters.DateFilter(field_name='registered_at', lookup_expr='lte')

    class Meta:
        model = Client
        fields = ['group', 'trainer', 'status', 'training_format', 'group_type', 'is_repeat']
