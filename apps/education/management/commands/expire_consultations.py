"""
Auto-expire consultations whose expires_at has passed but status is still 'active'.

Run as a cron job hourly (or more frequently):
  python manage.py expire_consultations
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.education.models import Consultation


class Command(BaseCommand):
    help = 'Mark active consultations whose expires_at has passed as expired.'

    def handle(self, *args, **options):
        now = timezone.now()
        updated = Consultation.objects.filter(
            status='active',
            deleted_at__isnull=True,
            expires_at__lt=now,
        ).update(status='expired')

        if updated:
            self.stdout.write(
                self.style.SUCCESS(f'Expired {updated} consultation(s).')
            )
        else:
            self.stdout.write('No consultations to expire.')
