from django.contrib import admin
from apps.attendance.models import Attendance


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ('client', 'lesson_date', 'is_absent', 'marked_by', 'note', 'created_at')
    search_fields = ('client__last_name', 'client__first_name', 'client__phone', 'note')
    list_filter = ('lesson_date', 'is_absent')
