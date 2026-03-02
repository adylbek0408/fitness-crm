import pytest
from decimal import Decimal
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.clients.models import Client
from apps.payments.models import FullPayment

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin',
        password='adminpass123',
        role='admin'
    )


@pytest.fixture
def registrar_user(db):
    return User.objects.create_user(
        username='registrar',
        password='registrarpass123',
        role='registrar'
    )


@pytest.fixture
def attendance_manager_user(db):
    return User.objects.create_user(
        username='attendance_mgr',
        password='attpass123',
        role='attendance_manager'
    )


def get_jwt_token(user):
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token)


@pytest.mark.django_db
class TestClientAPI:
    def test_create_client_full_payment_returns_201(self, api_client, admin_user):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(admin_user)}')
        data = {
            'first_name': 'John',
            'last_name': 'Doe',
            'phone': '+79991234567',
            'training_format': 'offline',
            'group_type': '1.5h',
            'payment_type': 'full',
            'payment_data': {'amount': '5000.00'},
        }
        response = api_client.post('/api/clients/', data, format='json')
        assert response.status_code == 201
        assert response.data['first_name'] == 'John'
        assert response.data['full_payment']['amount'] == '5000.00'

    def test_create_client_installment_returns_201(self, api_client, admin_user):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(admin_user)}')
        data = {
            'first_name': 'Jane',
            'last_name': 'Smith',
            'phone': '+79991234568',
            'training_format': 'offline',
            'group_type': '2.5h',
            'payment_type': 'installment',
            'payment_data': {
                'total_cost': '10000.00',
                'deadline': '2025-06-01',
            },
        }
        response = api_client.post('/api/clients/', data, format='json')
        assert response.status_code == 201
        assert response.data['payment_type'] == 'installment'
        assert response.data['installment_plan']['total_cost'] == '10000.00'

    def test_create_client_duplicate_phone_returns_400(self, api_client, admin_user):
        Client.objects.create(
            first_name='Existing',
            last_name='User',
            phone='+79991234569',
            training_format='offline',
            group_type='1.5h',
            payment_type='full'
        )
        FullPayment.objects.create(
            client=Client.objects.get(phone='+79991234569'),
            amount=Decimal('5000.00')
        )
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(admin_user)}')
        data = {
            'first_name': 'John',
            'last_name': 'Doe',
            'phone': '+79991234569',
            'training_format': 'offline',
            'group_type': '1.5h',
            'payment_type': 'full',
            'payment_data': {'amount': '5000.00'},
        }
        response = api_client.post('/api/clients/', data, format='json')
        assert response.status_code == 400

    def test_list_clients_returns_200(self, api_client, admin_user):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(admin_user)}')
        response = api_client.get('/api/clients/')
        assert response.status_code == 200

    def test_filter_clients_by_status(self, api_client, admin_user):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(admin_user)}')
        response = api_client.get('/api/clients/?status=active')
        assert response.status_code == 200

    def test_filter_clients_by_training_format(self, api_client, admin_user):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(admin_user)}')
        response = api_client.get('/api/clients/?training_format=offline')
        assert response.status_code == 200

    def test_registrar_can_create_client(self, api_client, registrar_user):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(registrar_user)}')
        data = {
            'first_name': 'Bob',
            'last_name': 'Registrar',
            'phone': '+79991234570',
            'training_format': 'offline',
            'group_type': '1.5h',
            'payment_type': 'full',
            'payment_data': {'amount': '5000.00'},
        }
        response = api_client.post('/api/clients/', data, format='json')
        assert response.status_code == 201

    def test_attendance_manager_cannot_create_client(self, api_client, attendance_manager_user):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(attendance_manager_user)}')
        data = {
            'first_name': 'Bob',
            'last_name': 'Test',
            'phone': '+79991234571',
            'training_format': 'offline',
            'group_type': '1.5h',
            'payment_type': 'full',
            'payment_data': {'amount': '5000.00'},
        }
        response = api_client.post('/api/clients/', data, format='json')
        assert response.status_code == 403
