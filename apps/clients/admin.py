from django.contrib import admin
from apps.clients.models import Client, ClientAccount


@admin.register(ClientAccount)
class ClientAccountAdmin(admin.ModelAdmin):
    list_display = ('username', 'client')
    search_fields = ('username',)
    raw_id_fields = ('client',)


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ('last_name', 'first_name', 'phone', 'training_format', 'group_type', 'status', 'group', 'trainer', 'registered_at', 'bonus_percent', 'bonus_balance')
    search_fields = ('first_name', 'last_name', 'phone')
    list_filter = ('status', 'training_format', 'group_type', 'payment_type', 'is_repeat')
