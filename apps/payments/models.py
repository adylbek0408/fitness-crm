import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import UUIDTimestampedModel


def receipt_upload_path(instance, filename):
    ext = filename.split('.')[-1]
    return f"receipts/{instance.client_id}/{uuid.uuid4()}.{ext}"


class FullPayment(UUIDTimestampedModel):
    """One-time full payment for a client."""

    client = models.ForeignKey(
        'clients.Client',
        on_delete=models.CASCADE,
        related_name='full_payments'
    )
    receipt = models.ImageField(
        upload_to=receipt_upload_path,
        null=True,
        blank=True
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    is_paid = models.BooleanField(default=False)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Full Payment'
        verbose_name_plural = 'Full Payments'

    def __str__(self):
        return f"FullPayment for {self.client} — paid={self.is_paid}"

    def mark_as_paid(self):
        self.is_paid = True
        self.paid_at = timezone.now()
        self.save(update_fields=['is_paid', 'paid_at'])


class InstallmentPlan(UUIDTimestampedModel):
    """Installment payment plan for a client."""

    client = models.ForeignKey(
        'clients.Client',
        on_delete=models.CASCADE,
        related_name='installment_plans'
    )
    total_cost = models.DecimalField(max_digits=12, decimal_places=2)
    deadline = models.DateField()

    class Meta:
        verbose_name = 'Installment Plan'
        verbose_name_plural = 'Installment Plans'

    def __str__(self):
        return f"InstallmentPlan for {self.client}"

    @property
    def total_paid(self):
        from django.db.models import Sum
        result = self.payments.aggregate(total=Sum('amount'))['total']
        return result or Decimal('0.00')

    @property
    def remaining(self):
        return self.total_cost - self.total_paid

    @property
    def is_closed(self):
        return self.remaining <= Decimal('0.00')


def installment_receipt_upload_path(instance, filename):
    ext = filename.split('.')[-1]
    return f"receipts/{instance.plan.client_id}/installments/{uuid.uuid4()}.{ext}"


class InstallmentPayment(UUIDTimestampedModel):
    """Single payment within an installment plan."""

    plan = models.ForeignKey(
        InstallmentPlan,
        on_delete=models.CASCADE,
        related_name='payments'
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    paid_at = models.DateField()
    receipt = models.ImageField(
        upload_to=installment_receipt_upload_path,
        null=True,
        blank=True
    )
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        verbose_name = 'Installment Payment'
        verbose_name_plural = 'Installment Payments'
        ordering = ['paid_at']
        indexes = [
            models.Index(fields=['plan', 'paid_at']),
        ]

    def __str__(self):
        return f"Payment {self.amount} on {self.paid_at} for plan {self.plan_id}"


class RefundLog(UUIDTimestampedModel):
    """
    Лог возвратов денег клиентам.
    Создаётся при каждом успешном возврате, чтобы
    сохранить историю даже после удаления платежа.
    """
    client_name  = models.CharField(max_length=200)
    client_id    = models.CharField(max_length=36, blank=True, db_index=True)
    amount       = models.DecimalField(max_digits=12, decimal_places=2)
    payment_type = models.CharField(
        max_length=15,
        choices=[('full', 'Полная оплата'), ('installment', 'Рассрочка')],
        blank=True,
    )
    note = models.CharField(max_length=500, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,          # ← правильно
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='refund_logs',
    )

    class Meta:
        verbose_name        = 'Возврат средств'
        verbose_name_plural = 'Возвраты средств'
        ordering            = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at']),
        ]

    def __str__(self):
        return f"Refund {self.amount} → {self.client_name} at {self.created_at}"
