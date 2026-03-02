from django.contrib import admin
from apps.clients.models import Client


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ('last_name', 'first_name', 'phone', 'training_format', 'group_type', 'status', 'group', 'trainer', 'registered_at')
    search_fields = ('first_name', 'last_name', 'middle_name', 'phone')
    list_filter = ('status', 'training_format', 'group_type', 'payment_type', 'is_repeat')
