import django_filters

from .models import Group


class GroupFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=Group.STATUS_CHOICES)
    trainer = django_filters.UUIDFilter(field_name='trainer__id')
    group_type = django_filters.ChoiceFilter(choices=Group.GROUP_TYPE_CHOICES)
    training_format = django_filters.ChoiceFilter(choices=Group.TRAINING_FORMAT_CHOICES)
    start_date_from = django_filters.DateFilter(field_name='start_date', lookup_expr='gte')
    start_date_to = django_filters.DateFilter(field_name='start_date', lookup_expr='lte')

    class Meta:
        model = Group
        fields = ['status', 'trainer', 'group_type', 'training_format']
