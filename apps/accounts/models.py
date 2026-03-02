from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('registrar', 'Registrar'),
        ('attendance_manager', 'Attendance Manager'),
    ]
    role = models.CharField(max_length=30, choices=ROLE_CHOICES, default='registrar')
    phone = models.CharField(max_length=20, blank=True)

    class Meta:
        verbose_name = 'User'
        verbose_name_plural = 'Users'

    def __str__(self):
        return f"{self.username} ({self.role})"
