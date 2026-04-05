import pytest
from datetime import date

from django.db import IntegrityError

from apps.clients.models import Client
from apps.trainers.models import Trainer


@pytest.mark.django_db
class TestClientModel:
    def test_client_creation(self):
        client = Client.objects.create(
            first_name='John',
            last_name='Doe',
            phone='+79991234567',
            training_format='offline',
            group_type='1.5h',
            payment_type='full'
        )
        assert client.first_name == 'John'
        assert client.last_name == 'Doe'
        assert client.phone == '+79991234567'
        assert client.status == 'new'
        assert client.training_format == 'offline'
        assert client.payment_type == 'full'

    def test_client_full_name(self):
        client = Client.objects.create(
            first_name='Jane',
            last_name='Smith',
            phone='+79991234569',
            training_format='offline',
            group_type='1.5h',
            payment_type='full'
        )
        assert client.full_name == 'Smith Jane'

    def test_client_phone_unique(self):
        Client.objects.create(
            first_name='John',
            last_name='Doe',
            phone='+79991234570',
            training_format='offline',
            group_type='1.5h',
            payment_type='full'
        )
        with pytest.raises(IntegrityError):
            Client.objects.create(
                first_name='Jane',
                last_name='Doe',
                phone='+79991234570',
                training_format='offline',
                group_type='1.5h',
                payment_type='full'
            )
