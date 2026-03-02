import pytest
from decimal import Decimal
from datetime import date

from apps.clients.models import Client
from apps.payments.models import FullPayment, InstallmentPlan, InstallmentPayment


@pytest.mark.django_db
class TestFullPaymentModel:
    def test_full_payment_creation(self):
        client = Client.objects.create(
            first_name='John',
            last_name='Doe',
            phone='+79991234567',
            training_format='offline',
            group_type='1.5h',
            payment_type='full'
        )
        payment = FullPayment.objects.create(client=client, amount=Decimal('5000.00'))
        assert payment.amount == Decimal('5000.00')
        assert payment.is_paid is False
        assert str(payment) == f'FullPayment for {client} — paid=False'


@pytest.mark.django_db
class TestInstallmentPlanModel:
    def test_installment_plan_total_paid_zero_when_no_payments(self):
        client = Client.objects.create(
            first_name='John',
            last_name='Doe',
            phone='+79991234568',
            training_format='offline',
            group_type='1.5h',
            payment_type='installment'
        )
        plan = InstallmentPlan.objects.create(
            client=client,
            total_cost=Decimal('10000.00'),
            deadline=date(2025, 6, 1)
        )
        assert plan.total_paid == Decimal('0.00')
        assert plan.remaining == Decimal('10000.00')

    def test_installment_plan_total_paid_aggregates_correctly(self):
        client = Client.objects.create(
            first_name='Jane',
            last_name='Smith',
            phone='+79991234569',
            training_format='offline',
            group_type='1.5h',
            payment_type='installment'
        )
        plan = InstallmentPlan.objects.create(
            client=client,
            total_cost=Decimal('10000.00'),
            deadline=date(2025, 6, 1)
        )
        InstallmentPayment.objects.create(plan=plan, amount=Decimal('3000.00'), paid_at=date(2025, 3, 1))
        InstallmentPayment.objects.create(plan=plan, amount=Decimal('2000.00'), paid_at=date(2025, 4, 1))
        assert plan.total_paid == Decimal('5000.00')
        assert plan.remaining == Decimal('5000.00')

    def test_installment_plan_is_closed_false_when_remaining(self):
        client = Client.objects.create(
            first_name='Bob',
            last_name='Brown',
            phone='+79991234570',
            training_format='offline',
            group_type='1.5h',
            payment_type='installment'
        )
        plan = InstallmentPlan.objects.create(
            client=client,
            total_cost=Decimal('10000.00'),
            deadline=date(2025, 6, 1)
        )
        InstallmentPayment.objects.create(plan=plan, amount=Decimal('3000.00'), paid_at=date(2025, 3, 1))
        assert plan.is_closed is False

    def test_installment_plan_is_closed_true_when_paid_in_full(self):
        client = Client.objects.create(
            first_name='Alice',
            last_name='White',
            phone='+79991234571',
            training_format='offline',
            group_type='1.5h',
            payment_type='installment'
        )
        plan = InstallmentPlan.objects.create(
            client=client,
            total_cost=Decimal('5000.00'),
            deadline=date(2025, 6, 1)
        )
        InstallmentPayment.objects.create(plan=plan, amount=Decimal('5000.00'), paid_at=date(2025, 3, 1))
        assert plan.is_closed is True
