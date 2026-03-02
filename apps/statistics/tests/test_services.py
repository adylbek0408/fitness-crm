import pytest
from decimal import Decimal
from datetime import date

from apps.statistics.services import StatisticsService
from apps.clients.models import Client
from apps.trainers.models import Trainer
from apps.groups.models import Group
from apps.payments.models import FullPayment, InstallmentPlan, InstallmentPayment
from apps.attendance.models import Attendance


@pytest.mark.django_db
class TestStatisticsService:
    def test_dashboard_returns_zeros_when_no_data(self):
        service = StatisticsService()
        result = service.get_dashboard({})
        assert result['total_revenue'] == Decimal('0.00')
        assert result['active_clients'] == 0
        assert result['full_payment_revenue'] == Decimal('0.00')
        assert result['installment_revenue'] == Decimal('0.00')

    def test_dashboard_counts_full_payment_revenue(self):
        trainer = Trainer.objects.create(first_name='John', last_name='Doe')
        group = Group.objects.create(
            number=101,
            group_type='1.5h',
            start_date=date(2025, 1, 1),
            trainer=trainer
        )
        client = Client.objects.create(
            first_name='Jane',
            last_name='Smith',
            phone='+79991234567',
            training_format='offline',
            group_type='1.5h',
            payment_type='full',
            group=group,
            trainer=trainer
        )
        payment = FullPayment.objects.create(client=client, amount=Decimal('5000.00'))
        payment.mark_as_paid()

        service = StatisticsService()
        result = service.get_dashboard({})
        assert result['total_revenue'] == Decimal('5000.00')
        assert result['full_payment_revenue'] == Decimal('5000.00')

    def test_dashboard_counts_installment_revenue(self):
        trainer = Trainer.objects.create(first_name='John', last_name='Doe')
        client = Client.objects.create(
            first_name='Jane',
            last_name='Smith',
            phone='+79991234568',
            training_format='offline',
            group_type='1.5h',
            payment_type='installment',
            trainer=trainer
        )
        plan = InstallmentPlan.objects.create(
            client=client,
            total_cost=Decimal('10000.00'),
            deadline=date(2025, 6, 1)
        )
        InstallmentPayment.objects.create(
            plan=plan,
            amount=Decimal('3000.00'),
            paid_at=date(2025, 3, 1)
        )

        service = StatisticsService()
        result = service.get_dashboard({})
        assert result['installment_revenue'] == Decimal('3000.00')
        assert result['total_revenue'] == Decimal('3000.00')

    def test_dashboard_filter_by_training_format(self):
        trainer = Trainer.objects.create(first_name='John', last_name='Doe')
        online_client = Client.objects.create(
            first_name='Online',
            last_name='User',
            phone='+79991234569',
            training_format='online',
            group_type='1.5h',
            payment_type='full',
            trainer=trainer
        )
        FullPayment.objects.create(client=online_client, amount=Decimal('3000.00'))
        online_payment = FullPayment.objects.get(client=online_client)
        online_payment.mark_as_paid()

        offline_client = Client.objects.create(
            first_name='Offline',
            last_name='User',
            phone='+79991234570',
            training_format='offline',
            group_type='1.5h',
            payment_type='full',
            trainer=trainer
        )
        FullPayment.objects.create(client=offline_client, amount=Decimal('5000.00'))
        offline_payment = FullPayment.objects.get(client=offline_client)
        offline_payment.mark_as_paid()

        service = StatisticsService()
        result_online = service.get_dashboard({'training_format': 'online'})
        result_offline = service.get_dashboard({'training_format': 'offline'})

        assert result_online['online_revenue'] == Decimal('3000.00')
        assert result_online['offline_revenue'] == Decimal('0.00')
        assert result_offline['offline_revenue'] == Decimal('5000.00')
        assert result_offline['online_revenue'] == Decimal('0.00')

    def test_dashboard_filter_by_date_range(self):
        from django.utils import timezone

        trainer = Trainer.objects.create(first_name='John', last_name='Doe')
        client = Client.objects.create(
            first_name='Jane',
            last_name='Smith',
            phone='+79991234571',
            training_format='offline',
            group_type='1.5h',
            payment_type='full',
            trainer=trainer
        )
        payment = FullPayment.objects.create(client=client, amount=Decimal('5000.00'))
        payment.paid_at = timezone.make_aware(
            timezone.datetime(2025, 3, 15, 12, 0, 0)
        )
        payment.is_paid = True
        payment.save()

        service = StatisticsService()
        result_in_range = service.get_dashboard({
            'date_from': date(2025, 3, 1),
            'date_to': date(2025, 3, 31)
        })
        result_out_range = service.get_dashboard({
            'date_from': date(2025, 1, 1),
            'date_to': date(2025, 2, 28)
        })

        assert result_in_range['total_revenue'] == Decimal('5000.00')
        assert result_out_range['total_revenue'] == Decimal('0.00')

    def test_by_group_returns_list(self):
        trainer = Trainer.objects.create(first_name='John', last_name='Doe')
        group = Group.objects.create(
            number=101,
            group_type='1.5h',
            start_date=date(2025, 1, 1),
            trainer=trainer
        )
        client = Client.objects.create(
            first_name='Jane',
            last_name='Smith',
            phone='+79991234572',
            training_format='offline',
            group_type='1.5h',
            payment_type='full',
            group=group,
            trainer=trainer
        )
        payment = FullPayment.objects.create(client=client, amount=Decimal('5000.00'))
        payment.mark_as_paid()

        service = StatisticsService()
        result = service.get_revenue_by_group({})
        assert len(result) >= 1
        group_result = next(g for g in result if g['group_number'] == 101)
        assert group_result['revenue'] == Decimal('5000.00')
        assert group_result['client_count'] == 1

    def test_by_trainer_returns_list(self):
        trainer = Trainer.objects.create(first_name='John', last_name='Doe')
        client = Client.objects.create(
            first_name='Jane',
            last_name='Smith',
            phone='+79991234573',
            training_format='offline',
            group_type='1.5h',
            payment_type='full',
            trainer=trainer
        )
        payment = FullPayment.objects.create(client=client, amount=Decimal('5000.00'))
        payment.mark_as_paid()

        service = StatisticsService()
        result = service.get_revenue_by_trainer({})
        assert len(result) >= 1
        trainer_result = next(t for t in result if t['trainer_name'] == 'Doe John')
        assert trainer_result['revenue'] == Decimal('5000.00')
        assert trainer_result['client_count'] == 1
