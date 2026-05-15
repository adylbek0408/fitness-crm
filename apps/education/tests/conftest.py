import pytest
from datetime import date
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.clients.models import Client, ClientAccount
from apps.clients.cabinet_auth import create_cabinet_tokens
from apps.education.models import Lesson, LiveStream, Consultation, StreamGuest, StreamViewer
from apps.trainers.models import Trainer
from apps.groups.models import Group

User = get_user_model()

_group_counter = 0


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_client(phone='+70000000001', first_name='Иван', last_name='Иванов'):
    client = Client.objects.create(
        first_name=first_name,
        last_name=last_name,
        phone=phone,
        training_format='online',
        group_type='1.5h',
        payment_type='full',
    )
    ClientAccount.objects.create(client=client, username=f'user_{phone[-4:]}')
    return client


def make_group(number=None, group_type='1.5h'):
    global _group_counter
    _group_counter += 1
    if number is None:
        number = f'TEST-{_group_counter}'
    trainer = Trainer.objects.create(first_name='Тест', last_name='Тренер')
    return Group.objects.create(
        number=number,
        group_type=group_type,
        start_date=date(2024, 1, 1),
        trainer=trainer,
        status='active',
    )


def cabinet_auth(api_client, client):
    tokens = create_cabinet_tokens(client)
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')


def admin_token(user):
    return str(RefreshToken.for_user(user).access_token)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(username='admin', password='pass', role='admin')


@pytest.fixture
def client_a(db):
    return make_client(phone='+70000000001', first_name='Алия', last_name='Бекова')


@pytest.fixture
def client_b(db):
    return make_client(phone='+70000000002', first_name='Данияр', last_name='Сейтов')


@pytest.fixture
def group(db):
    return make_group(number='FIXTURE-1')


@pytest.fixture
def live_stream(db):
    return LiveStream.objects.create(
        title='Тест эфир',
        status='live',
    )


@pytest.fixture
def scheduled_stream(db):
    return LiveStream.objects.create(
        title='Запланированный',
        status='scheduled',
    )


@pytest.fixture
def lesson(db):
    return Lesson.objects.create(
        title='Тест урок',
        lesson_type='video',
        is_published=True,
        duration_sec=600,
    )


@pytest.fixture
def consultation(db):
    from django.utils import timezone
    from datetime import timedelta
    return Consultation.objects.create(
        title='Консультация',
        expires_at=timezone.now() + timedelta(days=7),
    )
