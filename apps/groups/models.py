from core.models import UUIDTimestampedModel
from django.db import models


class Group(UUIDTimestampedModel):
    GROUP_TYPE_CHOICES = [
        ('1.5h', '1.5 hours'),
        ('2.5h', '2.5 hours'),
    ]

    STATUS_CHOICES = [
        ('recruitment', 'Recruitment'),
        ('active', 'Active'),
        ('completed', 'Completed'),
    ]

    TRAINING_FORMAT_CHOICES = [
        ('offline', 'Offline'),
        ('online', 'Online'),
        ('mixed', 'Mixed'),
    ]

    number          = models.PositiveIntegerField(unique=True, help_text="Stream/group number")
    group_type      = models.CharField(max_length=10, choices=GROUP_TYPE_CHOICES)
    training_format = models.CharField(
        max_length=10, choices=TRAINING_FORMAT_CHOICES,
        default='offline',
        help_text="Формат обучения потока"
    )
    start_date = models.DateField()
    end_date   = models.DateField(null=True, blank=True)
    trainer    = models.ForeignKey(
        'trainers.Trainer',
        on_delete=models.PROTECT,
        related_name='groups'
    )
    schedule = models.TextField(blank=True)
    status   = models.CharField(max_length=20, choices=STATUS_CHOICES, default='recruitment')

    class Meta:
        verbose_name        = 'Group'
        verbose_name_plural = 'Groups'
        ordering            = ['-number']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['trainer']),
        ]

    def __str__(self):
        return f"Group #{self.number} ({self.group_type}) — {self.status}"
