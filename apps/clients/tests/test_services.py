import pytest
from decimal import Decimal
from datetime import date

from core.exceptions import ValidationError

from apps.clients.models import Client
from apps.clients.services import ClientService
from apps.payments.models import FullPayment, InstallmentPlan


@pytest.mark.django_db
class TestClientService:
    def test_create_client_with_full_payment(self):
        service = ClientService()
        data = {
            'first_name': 'John',
            'last_name': 'Doe',
            'phone': '+79991234567',
            'training_format': 'offline',
            'group_type': '1.5h',
            'payment_type': 'full',
            'payment_data': {'amount': Decimal('5000.00')},
        }
        client = service.create_client(data)
        assert client.first_name == 'John'
        assert client.last_name == 'Doe'
        assert client.phone == '+79991234567'
        assert client.payment_type == 'full'
        full_payment = FullPayment.objects.get(client=client)
        assert full_payment.amount == Decimal('5000.00')

    def test_create_client_with_installment_plan(self):
        service = ClientService()
        data = {
            'first_name': 'Jane',
            'last_name': 'Smith',
            'phone': '+79991234568',
            'training_format': 'offline',
            'group_type': '2.5h',
            'payment_type': 'installment',
            'payment_data': {
                'total_cost': Decimal('10000.00'),
                'deadline': date(2025, 6, 1),
            },
        }
        client = service.create_client(data)
        assert client.payment_type == 'installment'
        plan = InstallmentPlan.objects.get(client=client)
        assert plan.total_cost == Decimal('10000.00')
        assert plan.deadline == date(2025, 6, 1)

    def test_create_client_duplicate_phone_raises(self):
        service = ClientService()
        existing_client = Client.objects.create(
            first_name='Existing',
            last_name='User',
            phone='+79991234569',
            training_format='offline',
            group_type='1.5h',
            payment_type='full'
        )
        FullPayment.objects.create(client=existing_client, amount=Decimal('5000.00'))
        data = {
            'first_name': 'John',
            'last_name': 'Doe',
            'phone': '+79991234569',
            'training_format': 'offline',
            'group_type': '1.5h',
            'payment_type': 'full',
            'payment_data': {'amount': Decimal('5000.00')},
        }
        with pytest.raises(ValidationError) as exc_info:
            service.create_client(data)
        assert 'already exists' in str(exc_info.value)

    def test_create_client_discount_without_repeat_raises(self):
        service = ClientService()
        data = {
            'first_name': 'John',
            'last_name': 'Doe',
            'phone': '+79991234570',
            'training_format': 'offline',
            'group_type': '1.5h',
            'payment_type': 'full',
            'payment_data': {'amount': Decimal('5000.00')},
            'is_repeat': False,
            'discount': Decimal('10.00'),
        }
        with pytest.raises(ValidationError) as exc_info:
            service.create_client(data)
        assert 'Discount' in str(exc_info.value)

    def test_update_client_payment_type_change_raises(self):
        service = ClientService()
        data = {
            'first_name': 'John',
            'last_name': 'Doe',
            'phone': '+79991234571',
            'training_format': 'offline',
            'group_type': '1.5h',
            'payment_type': 'full',
            'payment_data': {'amount': Decimal('5000.00')},
        }
        client = service.create_client(data)
        with pytest.raises(ValidationError) as exc_info:
            service.update_client(str(client.id), {'payment_type': 'installment'})
        assert 'payment_type' in str(exc_info.value).lower()

    def test_change_status_invalid_raises(self):
        service = ClientService()
        client = Client.objects.create(
            first_name='John',
            last_name='Doe',
            phone='+79991234572',
            training_format='offline',
            group_type='1.5h',
            payment_type='full'
        )
        FullPayment.objects.create(client=client, amount=Decimal('5000.00'))
        with pytest.raises(ValidationError) as exc_info:
            service.change_status(str(client.id), 'invalid_status')
        assert 'Invalid status' in str(exc_info.value)
