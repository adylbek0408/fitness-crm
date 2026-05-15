"""
Mark stream viewers as inactive when their heartbeat is older than the
threshold (default 90 s — 3 missed heartbeats at 30 s intervals).

Run as a cron job every 2–5 minutes:
  python manage.py cleanup_stale_viewers
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta

from apps.education.models import StreamViewer


class Command(BaseCommand):
    help = 'Mark stream viewers whose heartbeat has expired as inactive.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--threshold', type=int, default=90,
            help='Seconds since last heartbeat before a viewer is considered stale (default: 90)',
        )

    def handle(self, *args, **options):
        threshold = options['threshold']
        cutoff = timezone.now() - timedelta(seconds=threshold)
        now = timezone.now()

        updated = StreamViewer.objects.filter(
            is_active=True,
            last_heartbeat_at__lt=cutoff,
        ).update(is_active=False, left_at=now)

        if updated:
            self.stdout.write(
                self.style.SUCCESS(f'Marked {updated} stale viewer(s) as inactive.')
            )
        else:
            self.stdout.write('No stale viewers found.')
