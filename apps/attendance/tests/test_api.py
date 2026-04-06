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
def auth_user(db):
    return User.objects.create_user(
        username='admin',
        password='adminpass123',
        role='admin'
    )


@pytest.fixture
def offline_client(db):
    client = Client.objects.create(
        first_name='John',
        last_name='Doe',
        phone='+79991234567',
        training_format='offline',
        group_type='1.5h',
        payment_type='full'
    )
    FullPayment.objects.create(client=client, amount=Decimal('5000.00'))
    return client


@pytest.fixture
def online_client(db):
    client = Client.objects.create(
        first_name='Jane',
        last_name='Smith',
        phone='+79991234568',
        training_format='online',
        group_type='1.5h',
        payment_type='full'
    )
    FullPayment.objects.create(client=client, amount=Decimal('5000.00'))
    return client


def get_jwt_token(user):
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token)


@pytest.mark.django_db
class TestAttendanceAPI:
    def test_mark_attendance_returns_200(self, api_client, auth_user, offline_client):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(auth_user)}')
        data = {
            'client_id': str(offline_client.id),
            'lesson_date': '2025-03-01',
            'is_absent': False,
        }
        response = api_client.post('/api/attendance/mark/', data, format='json')
        assert response.status_code == 200
        assert response.data['lesson_date'] == '2025-03-01'
        assert response.data['is_absent'] is False

    def test_mark_attendance_online_client_returns_400(self, api_client, auth_user, online_client):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(auth_user)}')
        data = {
            'client_id': str(online_client.id),
            'lesson_date': '2025-03-01',
            'is_absent': False,
        }
        response = api_client.post('/api/attendance/mark/', data, format='json')
        assert response.status_code == 400

    def test_bulk_mark_attendance_returns_200(self, api_client, auth_user, offline_client):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(auth_user)}')
        data = {
            'lesson_date': '2025-03-01',
            'records': [
                {
                    'client_id': str(offline_client.id),
                    'lesson_date': '2025-03-01',
                    'is_absent': False,
                },
            ],
        }
        response = api_client.post('/api/attendance/bulk-mark/', data, format='json')
        assert response.status_code == 200
        assert len(response.data['saved']) == 1
        assert response.data['skipped'] == []
