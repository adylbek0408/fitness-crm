from django.contrib import admin
from apps.groups.models import Group


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    list_display = ('number', 'group_type', 'trainer', 'status', 'start_date', 'end_date', 'created_at')
    search_fields = ('number', 'schedule')
    list_filter = ('status', 'group_type', 'trainer')
