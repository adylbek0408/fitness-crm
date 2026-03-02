from django.conf import settings
from django.db import models

from core.models import UUIDTimestampedModel


class Attendance(UUIDTimestampedModel):
    """Attendance record. Only for offline clients."""

    client = models.ForeignKey(
        'clients.Client',
        on_delete=models.CASCADE,
        related_name='attendance_records'
    )
    lesson_date = models.DateField()
    is_absent = models.BooleanField(
        default=False,
        help_text="True = absent (НБ)"
    )
    note = models.CharField(max_length=255, blank=True)
    marked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='marked_attendance'
    )

    class Meta:
        verbose_name = 'Attendance'
        verbose_name_plural = 'Attendance Records'
        ordering = ['-lesson_date']
        constraints = [
            models.UniqueConstraint(
                fields=['client', 'lesson_date'],
                name='unique_attendance_per_client_per_day'
            )
        ]
        indexes = [
            models.Index(fields=['client', 'lesson_date']),
            models.Index(fields=['lesson_date']),
            models.Index(fields=['is_absent']),
        ]

    def __str__(self):
        status = 'absent' if self.is_absent else 'present'
        return f"{self.client} — {self.lesson_date} — {status}"
