from core.models import UUIDTimestampedModel
from django.db import models


class Trainer(UUIDTimestampedModel):
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    phone = models.CharField(max_length=20, blank=True)
    schedule = models.TextField(blank=True, help_text="Free-form schedule description")
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Trainer'
        verbose_name_plural = 'Trainers'
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return f"{self.last_name} {self.first_name}"

    @property
    def full_name(self):
        return f"{self.last_name} {self.first_name}"
