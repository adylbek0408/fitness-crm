from django.contrib.auth.models import AbstractUser
from django.db import models
from django.conf import settings


class User(AbstractUser):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('registrar', 'Registrar'),
    ]
    role = models.CharField(max_length=30, choices=ROLE_CHOICES, default='registrar')
    phone = models.CharField(max_length=20, blank=True)

    class Meta:
        verbose_name = 'User'
        verbose_name_plural = 'Users'

    def __str__(self):
        return f"{self.username} ({self.role})"


class ManagerProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='manager_profile',
    )
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    password_plain = models.CharField(
        max_length=128, blank=True, default='',
        help_text='Пароль для отображения администратору',
    )
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Manager Profile'
        verbose_name_plural = 'Manager Profiles'

    def __str__(self):
        return f"{self.last_name} {self.first_name} ({self.user.username})"
