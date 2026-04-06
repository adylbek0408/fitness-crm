"""
Полностью очищает базу данных (flush) и заново создаёт демо-данные:
учётные записи admin/registrar, тренеры, потоки (группы), клиенты, оплаты, посещаемость.

Использование:
  python manage.py reset_demo_database
  python manage.py reset_demo_database --password-admin mypass --password-registrar regpass
"""
from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Полная очистка БД (flush) и заполнение демо: тренеры, потоки, клиенты.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--password-admin',
            type=str,
            default='admin123',
            dest='password_admin',
            help='Пароль пользователя admin после сброса',
        )
        parser.add_argument(
            '--password-registrar',
            type=str,
            default='registrar123',
            dest='password_registrar',
            help='Пароль пользователя registrar после сброса',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING('Удаление всех данных из базы (flush)...'))
        call_command('flush', interactive=False, verbosity=0)

        self.stdout.write('Применение миграций (на всякий случай)...')
        call_command('migrate', interactive=False, verbosity=0)

        self.stdout.write('Создание admin и registrar...')
        call_command(
            'create_staff_users',
            password_admin=options['password_admin'],
            password_registrar=options['password_registrar'],
        )

        self.stdout.write('Загрузка тренеров, потоков, клиентов, оплат, посещаемости...')
        call_command('fill_test_data')

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('Готово. База очищена и заполнена демо-данными.'))
        self.stdout.write('  Вход: admin / ' + options['password_admin'])
        self.stdout.write('  Вход: registrar / ' + options['password_registrar'])
