"""
Fill database with test data: trainers, groups, clients, payments, attendance.
Safe to run multiple times (skips if data already exists, or use --flush to clear first).
"""
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.models import User
from apps.trainers.models import Trainer
from apps.groups.models import Group
from apps.clients.models import Client, ClientAccount
from apps.payments.models import FullPayment, InstallmentPlan, InstallmentPayment
from apps.attendance.models import Attendance
from apps.clients.models import BonusTransaction, ClientGroupHistory
from apps.payments.models import RefundLog


# Test data constants
TRAINERS_DATA = [
    {'first_name': 'Алексей', 'last_name': 'Петров', 'phone': '+998901111001', 'schedule': 'Пн-Пт 9:00-18:00'},
    {'first_name': 'Мария', 'last_name': 'Иванова', 'phone': '+998901111002', 'schedule': 'Вт, Чт, Сб 10:00-14:00'},
    {'first_name': 'Дмитрий', 'last_name': 'Сидоров', 'phone': '+998901111003', 'schedule': 'Пн-Сб 8:00-12:00'},
    {'first_name': 'Елена', 'last_name': 'Козлова', 'phone': '+998901111004', 'schedule': 'Ср, Пт 14:00-20:00'},
]

CLIENTS_OFFLINE = [
    ('Иван', 'Смирнов', 'full'),
    ('Ольга', 'Кузнецова', 'full'),
    ('Андрей', 'Попов', 'installment'),
    ('Наталья', 'Васильева', 'installment'),
    ('Сергей', 'Михайлов', 'full'),
    ('Анна', 'Федорова', 'full'),
    ('Павел', 'Морозов', 'installment'),
    ('Екатерина', 'Волкова', 'full'),
    ('Игорь', 'Соколов', 'full'),
    ('Татьяна', 'Лебедева', 'installment'),
    ('Михаил', 'Новиков', 'full'),
    ('Юлия', 'Козлова', 'full'),
]

CLIENTS_ONLINE = [
    ('Роман', 'Егоров', 'full'),
    ('Дарья', 'Степанова', 'installment'),
    ('Александр', 'Захаров', 'full'),
]


class Command(BaseCommand):
    help = 'Fill database with test data (trainers, groups, clients, payments, attendance).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--flush',
            action='store_true',
            help='Delete existing test-related data before filling (clients, payments, attendance, groups, trainers).',
        )

    def handle(self, *args, **options):
        if options['flush']:
            self._flush()
        self._ensure_users()
        trainers = self._create_trainers()
        groups = self._create_groups(trainers)
        admin_user = User.objects.filter(role='admin').first()
        registrar = User.objects.filter(role='registrar').first() or admin_user
        clients = self._create_clients(groups, trainers, registrar)
        self._create_payments(clients)
        self._create_attendance(clients)
        self.stdout.write(self.style.SUCCESS('Test data created successfully.'))

    def _flush(self):
        RefundLog.objects.all().delete()
        BonusTransaction.objects.all().delete()
        ClientGroupHistory.objects.all().delete()
        ClientAccount.objects.all().delete()
        Attendance.objects.all().delete()
        InstallmentPayment.objects.all().delete()
        InstallmentPlan.objects.all().delete()
        FullPayment.objects.all().delete()
        Client.objects.all().delete()
        Group.objects.all().delete()
        Trainer.objects.all().delete()
        self.stdout.write('Flushed clients, payments, attendance, groups, trainers, refunds, bonuses.')

    def _ensure_users(self):
        if not User.objects.filter(role='registrar').exists():
            User.objects.create_user(
                username='registrar',
                email='registrar@example.com',
                password='registrar123',
                role='registrar',
            )
            self.stdout.write('Created user: registrar / registrar123')

    def _create_trainers(self):
        created = []
        for i, data in enumerate(TRAINERS_DATA):
            t, _ = Trainer.objects.get_or_create(
                phone=data['phone'],
                defaults={
                    'first_name': data['first_name'],
                    'last_name': data['last_name'],
                    'schedule': data['schedule'],
                    'is_active': True,
                },
            )
            created.append(t)
        if created:
            self.stdout.write(f'Trainers: {len(created)}')
        return created

    def _create_groups(self, trainers):
        today = date.today()
        group_specs = [
            (101, '1.5h', 0, 30, 'active'),
            (102, '1.5h', 1, 45, 'active'),
            (103, '2.5h', 2, 20, 'active'),
            (104, '1.5h', 0, 60, 'recruitment'),
            (105, '2.5h', 3, 14, 'completed'),
        ]
        created = []
        for number, group_type, trainer_idx, days_ago_start, status in group_specs:
            start = today - timedelta(days=days_ago_start * 30)
            end = today + timedelta(days=90) if status == 'active' else (today - timedelta(days=30) if status == 'completed' else None)
            g, _ = Group.objects.get_or_create(
                number=str(number),
                defaults={
                    'group_type': group_type,
                    'training_format': 'offline',
                    'start_date': start,
                    'end_date': end,
                    'trainer': trainers[trainer_idx % len(trainers)],
                    'schedule': 'Пн, Ср, Пт 10:00' if group_type == '1.5h' else 'Вт, Чт 09:00',
                    'status': status,
                },
            )
            created.append(g)
        self.stdout.write(f'Groups: {len(created)}')
        return created

    def _create_clients(self, groups, trainers, registrar):
        active_groups = [g for g in groups if g.status == 'active']
        if not active_groups:
            active_groups = groups[:2]
        clients_created = []
        phone_base = 998901234000

        all_clients_spec = [(c, 'offline') for c in CLIENTS_OFFLINE] + [(c, 'online') for c in CLIENTS_ONLINE]
        for idx, (name_tuple, training_format) in enumerate(all_clients_spec):
            first_name, last_name, payment_type = name_tuple
            phone = f'+{phone_base + idx}'
            if Client.objects.filter(phone=phone).exists():
                continue
            group = active_groups[idx % len(active_groups)]
            trainer = group.trainer
            client = Client.objects.create(
                first_name=first_name,
                last_name=last_name,
                phone=phone,
                training_format=training_format,
                group_type=group.group_type,
                group=group,
                trainer=trainer,
                status='active' if idx % 5 != 4 else 'completed',
                is_repeat=(idx % 4 == 0),
                discount=Decimal('10.00') if idx % 3 == 0 else Decimal('0'),
                bonus_percent=5 if idx % 2 == 0 else 10,
                payment_type=payment_type,
                registered_at=date.today() - timedelta(days=idx * 3),
                registered_by=registrar,
            )
            # Create cabinet account for test data
            username = f"client_{str(client.id).replace('-', '')[:12]}"
            base_username = username
            counter = 0
            while ClientAccount.objects.filter(username=username).exists():
                counter += 1
                username = f"{base_username}_{counter}"
            account = ClientAccount.objects.create(client=client, username=username)
            account.set_password('client123')
            clients_created.append(client)

        self.stdout.write(f'Clients: {len(clients_created)}')
        return clients_created

    def _create_payments(self, clients):
        today = date.today()
        for c in clients:
            if hasattr(c, 'full_payment') or hasattr(c, 'installment_plan'):
                continue
            if c.payment_type == 'full':
                amount = Decimal('1500000.00')
                FullPayment.objects.create(
                    client=c,
                    amount=amount,
                    is_paid=True,
                    paid_at=timezone.now() - timedelta(days=5),
                )
            else:
                total = Decimal('1800000.00')
                deadline = today + timedelta(days=90)
                plan = InstallmentPlan.objects.create(
                    client=c,
                    total_cost=total,
                    deadline=deadline,
                )
                # First 2 installments paid
                for i, days_ago in enumerate([30, 15]):
                    InstallmentPayment.objects.create(
                        plan=plan,
                        amount=Decimal('600000.00'),
                        paid_at=today - timedelta(days=days_ago),
                    )
        self.stdout.write('Payments created for all clients.')

    def _create_attendance(self, clients):
        offline_clients = [c for c in clients if c.training_format == 'offline']
        admin = User.objects.filter(role='admin').first()
        today = date.today()
        count = 0
        for c in offline_clients:
            for d in range(1, 14):  # last 2 weeks
                lesson_date = today - timedelta(days=d)
                if lesson_date.weekday() in (0, 2, 4):  # Mon, Wed, Fri
                    _, created = Attendance.objects.get_or_create(
                        client=c,
                        lesson_date=lesson_date,
                        defaults={'is_absent': d % 5 == 0, 'marked_by': admin},
                    )
                    if created:
                        count += 1
        self.stdout.write(f'Attendance: {count} records for offline clients.')
