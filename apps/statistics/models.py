from core.models import UUIDTimestampedModel
from django.db import models


class Statistic(UUIDTimestampedModel):
    metric_name = models.CharField(max_length=100)
    value = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        verbose_name = 'Statistic'
        verbose_name_plural = 'Statistics'

    def __str__(self):
        return f"{self.metric_name}: {self.value}"
