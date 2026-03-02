import pytest
from decimal import Decimal
from datetime import date

from core.exceptions import NotFoundError, ValidationError

from apps.clients.models import Client
from apps.payments.models import FullPayment, InstallmentPlan, InstallmentPayment
from apps.payments.services import PaymentService


@pytest.mark.django_db
class TestPaymentService:
    def test_mark_full_payment_paid(self):
        client = Client.objects.create(
            first_name='John',
            last_name='Doe',
            phone='+79991234567',
            training_format='offline',
            group_type='1.5h',
            payment_type='full'
        )
        payment = FullPayment.objects.create(client=client, amount=Decimal('5000.00'))
        service = PaymentService()
        result = service.mark_full_payment_paid(str(client.id))
        assert result.is_paid is True
        assert result.paid_at is not None
        payment.refresh_from_db()
        assert payment.is_paid is True

    def test_mark_full_payment_paid_twice_raises(self):
        client = Client.objects.create(
            first_name='Jane',
            last_name='Smith',
            phone='+79991234568',
            training_format='offline',
            group_type='1.5h',
            payment_type='full'
        )
        payment = FullPayment.objects.create(client=client, amount=Decimal('5000.00'))
        payment.mark_as_paid()
        service = PaymentService()
        with pytest.raises(ValidationError) as exc_info:
            service.mark_full_payment_paid(str(client.id))
        assert 'already marked as paid' in str(exc_info.value)

    def test_add_installment_payment(self):
        client = Client.objects.create(
            first_name='Bob',
            last_name='Brown',
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
        service = PaymentService()
        payment = service.add_installment_payment(str(plan.id), {
            'amount': Decimal('3000.00'),
            'paid_at': date(2025, 3, 1),
            'note': 'First installment',
        })
        assert payment.amount == Decimal('3000.00')
        assert payment.plan == plan
        assert plan.total_paid == Decimal('3000.00')

    def test_add_installment_payment_to_closed_plan_raises(self):
        client = Client.objects.create(
            first_name='Alice',
            last_name='White',
            phone='+79991234570',
            training_format='offline',
            group_type='1.5h',
            payment_type='installment'
        )
        plan = InstallmentPlan.objects.create(
            client=client,
            total_cost=Decimal('5000.00'),
            deadline=date(2025, 6, 1)
        )
        InstallmentPayment.objects.create(
            plan=plan,
            amount=Decimal('5000.00'),
            paid_at=date(2025, 3, 1)
        )
        service = PaymentService()
        with pytest.raises(ValidationError) as exc_info:
            service.add_installment_payment(str(plan.id), {
                'amount': Decimal('100.00'),
                'paid_at': date(2025, 3, 2),
            })
        assert 'already fully paid' in str(exc_info.value)

    def test_add_installment_payment_negative_amount_raises(self):
        client = Client.objects.create(
            first_name='Charlie',
            last_name='Black',
            phone='+79991234571',
            training_format='offline',
            group_type='1.5h',
            payment_type='installment'
        )
        plan = InstallmentPlan.objects.create(
            client=client,
            total_cost=Decimal('10000.00'),
            deadline=date(2025, 6, 1)
        )
        service = PaymentService()
        with pytest.raises(ValidationError) as exc_info:
            service.add_installment_payment(str(plan.id), {
                'amount': Decimal('-100.00'),
                'paid_at': date(2025, 3, 1),
            })
        assert 'positive' in str(exc_info.value).lower()
