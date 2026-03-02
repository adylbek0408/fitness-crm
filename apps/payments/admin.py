from django.contrib import admin
from apps.payments.models import FullPayment, InstallmentPlan, InstallmentPayment


@admin.register(FullPayment)
class FullPaymentAdmin(admin.ModelAdmin):
    list_display = ('client', 'amount', 'is_paid', 'paid_at', 'created_at')
    search_fields = ('client__last_name', 'client__first_name', 'client__phone')
    list_filter = ('is_paid',)


@admin.register(InstallmentPlan)
class InstallmentPlanAdmin(admin.ModelAdmin):
    list_display = ('client', 'total_cost', 'deadline', 'created_at')
    search_fields = ('client__last_name', 'client__first_name', 'client__phone')


@admin.register(InstallmentPayment)
class InstallmentPaymentAdmin(admin.ModelAdmin):
    list_display = ('plan', 'amount', 'paid_at', 'note', 'created_at')
    search_fields = ('plan__client__last_name', 'plan__client__first_name', 'note')
    list_filter = ('paid_at',)
