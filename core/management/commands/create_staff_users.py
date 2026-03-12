"""
Create staff users: admin (full access) and registrar (mobile only).
Safe to run multiple times — creates only if user does not exist.
"""
from django.core.management.base import BaseCommand

from apps.accounts.models import User


class Command(BaseCommand):
    help = 'Create admin and registrar users for Асылзада CRM (SPA admin + mobile).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--password-admin',
            type=str,
            default='admin123',
            help='Password for admin user (default: admin123)',
        )
        parser.add_argument(
            '--password-registrar',
            type=str,
            default='registrar123',
            help='Password for registrar user (default: registrar123)',
        )

    def handle(self, *args, **options):
        pw_admin = options['password_admin']
        pw_registrar = options['password_registrar']

        if not User.objects.filter(username='admin').exists():
            User.objects.create_user(
                username='admin',
                email='admin@example.com',
                password=pw_admin,
                role='admin',
                is_staff=True,
            )
            self.stdout.write(self.style.SUCCESS('Created user: admin / ' + pw_admin + ' (доступ: админка + мобилка)'))
        else:
            self.stdout.write('User admin already exists.')

        if not User.objects.filter(username='registrar').exists():
            User.objects.create_user(
                username='registrar',
                email='registrar@example.com',
                password=pw_registrar,
                role='registrar',
            )
            self.stdout.write(self.style.SUCCESS('Created user: registrar / ' + pw_registrar + ' (доступ: только мобилка)'))
        else:
            self.stdout.write('User registrar already exists.')

        self.stdout.write('')
        self.stdout.write('Логин: http://localhost:5173/login')
        self.stdout.write('  admin     — админка (/admin) и мобилка (/mobile)')
        self.stdout.write('  registrar — только мобилка (/mobile)')
