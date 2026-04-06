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
        assert response.data['bonus_percent'] == 10

    def test_create_client_bonus_percent_5(self, api_client, admin_user):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(admin_user)}')
        data = {
            'first_name': 'Пять',
            'last_name': 'Процентов',
            'phone': '+79991234599',
            'training_format': 'offline',
            'group_type': '1.5h',
            'payment_type': 'full',
            'bonus_percent': 5,
            'payment_data': {'amount': '5000.00'},
        }
        response = api_client.post('/api/clients/', data, format='json')
        assert response.status_code == 201
        assert response.data['bonus_percent'] == 5

    def test_create_client_bonus_percent_3(self, api_client, admin_user):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(admin_user)}')
        data = {
            'first_name': 'Три',
            'last_name': 'Процента',
            'phone': '+79991234598',
            'training_format': 'offline',
            'group_type': '1.5h',
            'payment_type': 'full',
            'bonus_percent': 3,
            'payment_data': {'amount': '10000.00'},
        }
        response = api_client.post('/api/clients/', data, format='json')
        assert response.status_code == 201
        assert response.data['bonus_percent'] == 3

    def test_create_client_bonus_percent_over_100_returns_400(self, api_client, admin_user):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(admin_user)}')
        data = {
            'first_name': 'Bad',
            'last_name': 'Percent',
            'phone': '+79991234597',
            'training_format': 'offline',
            'group_type': '1.5h',
            'payment_type': 'full',
            'bonus_percent': 101,
            'payment_data': {'amount': '1000.00'},
        }
        response = api_client.post('/api/clients/', data, format='json')
        assert response.status_code == 400

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

    def test_filter_clients_by_registered_by_matches_fk_or_name_snapshot(self, api_client, admin_user):
        """
        Фильтр «менеджер»: по UUID пользователя — и по FK, и по registered_by_name
        (как в create_client: «Фамилия Имя»), если запись вела другая учётка.
        """
        from apps.accounts.models import ManagerProfile

        mgr_user = User.objects.create_user(username='998777001', password='x', role='registrar')
        ManagerProfile.objects.create(user=mgr_user, first_name='Adylbek', last_name='Salijanov')
        registrar = User.objects.create_user(username='registrar_shared', password='x', role='registrar')

        c_match = Client.objects.create(
            first_name='Ivan', last_name='Test', phone='+79990000031',
            training_format='offline', group_type='1.5h', payment_type='full', status='new',
            registered_by=registrar,
            registered_by_name='Salijanov Adylbek',
        )
        Client.objects.create(
            first_name='Other', last_name='Client', phone='+79990000032',
            training_format='offline', group_type='1.5h', payment_type='full', status='new',
            registered_by=registrar,
            registered_by_name='Someone Else',
        )

        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt_token(admin_user)}')
        r = api_client.get(f'/api/clients/?registered_by={mgr_user.id}')
        assert r.status_code == 200
        ids = [x['id'] for x in r.data['results']]
        assert str(c_match.id) in ids
        assert len(ids) == 1
