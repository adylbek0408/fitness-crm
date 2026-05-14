"""
Tests for consultation business logic.
Covers: access validation, expiry, restore restrictions, trainer join.
"""
import pytest
from datetime import timedelta
from django.utils import timezone

from apps.education.models import Consultation
from .conftest import admin_token


@pytest.mark.django_db
class TestConsultationAccess:
    def test_active_link_returns_valid(self, api_client, consultation):
        r = api_client.get(f'/api/consultation/{consultation.room_uuid}/')
        assert r.status_code == 200
        assert r.data['valid'] is True

    def test_expired_link_returns_invalid(self, api_client, db):
        c = Consultation.objects.create(
            title='Просрочена',
            expires_at=timezone.now() - timedelta(hours=1),
        )
        r = api_client.get(f'/api/consultation/{c.room_uuid}/')
        assert r.data['valid'] is False
        c.refresh_from_db()
        assert c.status == 'expired'

    def test_cancelled_consultation_returns_invalid(self, api_client, db):
        c = Consultation.objects.create(
            title='Отменена',
            status='cancelled',
            expires_at=timezone.now() + timedelta(days=7),
        )
        r = api_client.get(f'/api/consultation/{c.room_uuid}/')
        assert r.data['valid'] is False

    def test_unknown_uuid_returns_404(self, api_client):
        import uuid
        r = api_client.get(f'/api/consultation/{uuid.uuid4()}/')
        assert r.status_code == 404

    def test_first_join_sets_started_at(self, api_client, consultation):
        assert consultation.started_at is None
        api_client.get(f'/api/consultation/{consultation.room_uuid}/')
        consultation.refresh_from_db()
        assert consultation.started_at is not None

    def test_second_join_does_not_reset_started_at(self, api_client, consultation):
        api_client.get(f'/api/consultation/{consultation.room_uuid}/')
        consultation.refresh_from_db()
        first_started = consultation.started_at
        api_client.get(f'/api/consultation/{consultation.room_uuid}/')
        consultation.refresh_from_db()
        assert consultation.started_at == first_started


@pytest.mark.django_db
class TestConsultationRestore:
    def test_restore_active_deleted_succeeds(self, api_client, admin_user, db):
        c = Consultation.objects.create(
            title='Удалённая активная',
            status='active',
            deleted_at=timezone.now(),
            expires_at=timezone.now() + timedelta(days=7),
        )
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(f'/api/education/consultations/{c.id}/restore/')
        assert r.status_code == 200
        c.refresh_from_db()
        assert c.deleted_at is None
        assert c.status == 'active'

    def test_restore_expired_consultation_blocked(self, api_client, admin_user, db):
        c = Consultation.objects.create(
            title='Просрочена удалённая',
            status='expired',
            deleted_at=timezone.now(),
            expires_at=timezone.now() - timedelta(days=1),
        )
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(f'/api/education/consultations/{c.id}/restore/')
        assert r.status_code == 400
        c.refresh_from_db()
        assert c.deleted_at is not None

    def test_restore_cancelled_consultation_blocked(self, api_client, admin_user, db):
        c = Consultation.objects.create(
            title='Отменена удалённая',
            status='cancelled',
            deleted_at=timezone.now(),
            expires_at=timezone.now() + timedelta(days=7),
        )
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(f'/api/education/consultations/{c.id}/restore/')
        assert r.status_code == 400


@pytest.mark.django_db
class TestTrainerJoinConsultation:
    def test_trainer_can_join_active(self, api_client, admin_user, consultation):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.get(f'/api/education/consultations/{consultation.id}/join-as-trainer/')
        assert r.status_code == 200
        assert r.data['valid'] is True

    def test_trainer_cannot_join_expired(self, api_client, admin_user, db):
        c = Consultation.objects.create(
            title='Просрочена для тренера',
            status='active',
            expires_at=timezone.now() - timedelta(hours=1),
        )
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.get(f'/api/education/consultations/{c.id}/join-as-trainer/')
        assert r.status_code == 400
        assert r.data['reason'] == 'expired'
        c.refresh_from_db()
        assert c.status == 'expired'

    def test_trainer_cannot_join_cancelled(self, api_client, admin_user, db):
        c = Consultation.objects.create(
            title='Отменена для тренера',
            status='cancelled',
            expires_at=timezone.now() + timedelta(days=7),
        )
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.get(f'/api/education/consultations/{c.id}/join-as-trainer/')
        assert r.status_code == 400


@pytest.mark.django_db
class TestConsultationIsConsumable:
    def test_active_not_expired_is_consumable(self, consultation):
        assert consultation.is_consumable is True

    def test_expired_status_not_consumable(self, db):
        c = Consultation.objects.create(
            status='expired',
            expires_at=timezone.now() - timedelta(hours=1),
        )
        assert c.is_consumable is False

    def test_past_expiry_date_not_consumable(self, db):
        c = Consultation.objects.create(
            status='active',
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        assert c.is_consumable is False

    def test_max_uses_reached_not_consumable(self, db):
        c = Consultation.objects.create(
            status='active',
            max_uses=3,
            used_count=3,
            expires_at=timezone.now() + timedelta(days=7),
        )
        assert c.is_consumable is False
