"""
Management command для автоматического обновления статусов потоков.

Запуск:
  python manage.py auto_update_group_status

Добавить в cron (каждый день в 00:05):
  5 0 * * * cd /path/to/project && python manage.py auto_update_group_status
"""
from datetime import date

from django.core.management.base import BaseCommand

from apps.groups.models import Group
from apps.groups.services import GroupService


class Command(BaseCommand):
    help = 'Автоматически обновляет статусы потоков по датам начала и окончания'

    def handle(self, *args, **options):
        today   = date.today()
        service = GroupService()
        activated = []
        completed = []

        # ── recruitment → active ──────────────────────────────────────────────
        to_activate = Group.objects.filter(
            status='recruitment',
            start_date__lte=today,
        )
        for group in to_activate:
            try:
                group.status = 'active'
                group.save(update_fields=['status'])
                activated.append(group.number)
                self.stdout.write(
                    self.style.SUCCESS(f'  ✓ Поток #{group.number}: recruitment → active')
                )
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'  ✗ Поток #{group.number}: ошибка активации — {e}')
                )

        # ── active → completed ────────────────────────────────────────────────
        to_complete = Group.objects.filter(
            status='active',
            end_date__isnull=False,
            end_date__lt=today,
        )
        for group in to_complete:
            try:
                service.close_group(str(group.id))
                completed.append(group.number)
                self.stdout.write(
                    self.style.SUCCESS(
                        f'  ✓ Поток #{group.number}: active → completed '
                        f'(клиенты переведены в completed)'
                    )
                )
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'  ✗ Поток #{group.number}: ошибка завершения — {e}')
                )

        if not activated and not completed:
            self.stdout.write('Нет потоков для обновления статуса.')
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f'\nИтого: активировано {len(activated)}, '
                    f'завершено {len(completed)} потоков.'
                )
            )
