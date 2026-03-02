import pytest
from decimal import Decimal
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.clients.models import Client
from apps.trainers.models import Trainer
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


def get_jwt_token(user):
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token)


@pytest.mark.django_db
class TestStatisticsAPI:
    def test_dashboard_requires_admin(self, api_client, registrar_user):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(registrar_user)}')
        response = api_client.get('/api/statistics/dashboard/')
        assert response.status_code == 403

    def test_dashboard_returns_200(self, api_client, admin_user):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(admin_user)}')
        response = api_client.get('/api/statistics/dashboard/')
        assert response.status_code == 200
        assert 'total_revenue' in response.data
        assert 'full_payment_revenue' in response.data
        assert 'installment_revenue' in response.data
        assert 'active_clients' in response.data

    def test_dashboard_filter_by_date(self, api_client, admin_user):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(admin_user)}')
        response = api_client.get(
            '/api/statistics/dashboard/',
            {'date_from': '2025-01-01', 'date_to': '2025-12-31'}
        )
        assert response.status_code == 200

    def test_by_group_returns_200(self, api_client, admin_user):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(admin_user)}')
        response = api_client.get('/api/statistics/by-group/')
        assert response.status_code == 200
        assert isinstance(response.data, list)

    def test_by_trainer_returns_200(self, api_client, admin_user):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(admin_user)}')
        response = api_client.get('/api/statistics/by-trainer/')
        assert response.status_code == 200
        assert isinstance(response.data, list)

    def test_invalid_date_range_returns_400(self, api_client, admin_user):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(admin_user)}')
        response = api_client.get(
            '/api/statistics/dashboard/',
            {'date_from': '2025-12-31', 'date_to': '2025-01-01'}
        )
        assert response.status_code == 400
