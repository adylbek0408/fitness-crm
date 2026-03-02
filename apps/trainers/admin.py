from django.contrib import admin
from apps.trainers.models import Trainer


@admin.register(Trainer)
class TrainerAdmin(admin.ModelAdmin):
    list_display = ('last_name', 'first_name', 'phone', 'is_active', 'created_at')
    search_fields = ('first_name', 'last_name', 'phone')
    list_filter = ('is_active',)
