from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from apps.accounts.models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('username', 'email', 'role', 'is_active', 'date_joined')
    list_filter = ('role', 'is_active', 'is_staff')
    search_fields = ('username', 'email', 'phone')
    ordering = ('-date_joined',)
    filter_horizontal = ()

    fieldsets = BaseUserAdmin.fieldsets + (
        ('Асылзада CRM', {'fields': ('role', 'phone')}),
    )

    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Асылзада CRM', {'fields': ('role', 'phone')}),
    )
