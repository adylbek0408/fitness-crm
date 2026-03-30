from datetime import date

from django.conf import settings
from django.db import models

from core.models import UUIDTimestampedModel


class ClientAccount(models.Model):
    """Cabinet access for client: login + password, one per client."""
    client = models.OneToOneField(
        'Client',
        on_delete=models.CASCADE,
        related_name='cabinet_account',
    )
    username = models.CharField(max_length=150, unique=True)
    password = models.CharField(max_length=128)  # hashed
    password_plain = models.CharField(
        max_length=100, blank=True, default='',
        help_text="Plain password for admin visibility"
    )

    def set_password(self, raw_password):
        from django.contrib.auth.hashers import make_password
        self.password = make_password(raw_password)
        self.password_plain = raw_password
        self.save(update_fields=['password', 'password_plain'])

    def check_password(self, raw_password):
        from django.contrib.auth.hashers import check_password
        return check_password(raw_password, self.password)

    def __str__(self):
        return f"Cabinet:{self.username}"


class Client(UUIDTimestampedModel):
    TRAINING_FORMAT_CHOICES = [
        ('online', 'Online'),
        ('offline', 'Offline'),
    ]

    GROUP_TYPE_CHOICES = [
        ('1.5h', '1.5 hours'),
        ('2.5h', '2.5 hours'),
    ]

    STATUS_CHOICES = [
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('expelled', 'Expelled'),
        ('frozen', 'Frozen'),
    ]

    PAYMENT_TYPE_CHOICES = [
        ('full', 'Full Payment'),
        ('installment', 'Installment'),
    ]

    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    phone = models.CharField(max_length=20, unique=True)

    training_format = models.CharField(max_length=10, choices=TRAINING_FORMAT_CHOICES)
    group_type = models.CharField(max_length=10, choices=GROUP_TYPE_CHOICES)
    group = models.ForeignKey(
        'groups.Group',
        on_delete=models.PROTECT,
        related_name='clients',
        null=True,
        blank=True
    )
    trainer = models.ForeignKey(
        'trainers.Trainer',
        on_delete=models.PROTECT,
        related_name='clients',
        null=True,
        blank=True
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')

    is_repeat = models.BooleanField(default=False)
    discount = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        help_text="Discount percentage (0-100)"
    )

    bonus_balance = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        help_text="Client bonus balance (visible in cabinet)"
    )

    payment_type = models.CharField(max_length=15, choices=PAYMENT_TYPE_CHOICES)

    registered_at = models.DateField(default=date.today)
    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='registered_clients'
    )

    class Meta:
        verbose_name = 'Client'
        verbose_name_plural = 'Clients'
        ordering = ['-registered_at', 'last_name']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['training_format']),
            models.Index(fields=['group']),
            models.Index(fields=['trainer']),
            models.Index(fields=['is_repeat']),
            models.Index(fields=['phone']),
        ]

    def __str__(self):
        return f"{self.last_name} {self.first_name} ({self.phone})"

    @property
    def full_name(self):
        return f"{self.last_name} {self.first_name}"


class BonusTransaction(UUIDTimestampedModel):
    """История бонусных операций клиента."""

    ACCRUAL    = 'accrual'
    REDEMPTION = 'redemption'
    TYPE_CHOICES = [
        (ACCRUAL,    'Начисление'),
        (REDEMPTION, 'Списание'),
    ]

    client = models.ForeignKey(
        'Client',
        on_delete=models.CASCADE,
        related_name='bonus_transactions'
    )
    transaction_type = models.CharField(max_length=15, choices=TYPE_CHOICES)
    # amount — всегда положительное число, тип определяется transaction_type
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    # сумма оплаты, с которой был посчитан бонус
    payment_amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    description = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='bonus_transactions'
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name        = 'Бонусная операция'
        verbose_name_plural = 'Бонусные операции'
        indexes = [
            models.Index(fields=['client', '-created_at']),
        ]

    def __str__(self):
        return f"{self.client} | {self.transaction_type} | {self.amount}"
