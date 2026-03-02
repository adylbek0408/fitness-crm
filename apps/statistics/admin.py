from django.contrib import admin
from apps.statistics.models import Statistic


@admin.register(Statistic)
class StatisticAdmin(admin.ModelAdmin):
    list_display = ('metric_name', 'value', 'created_at')
    search_fields = ('metric_name',)
