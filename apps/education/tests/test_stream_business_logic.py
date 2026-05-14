"""
Tests for live-stream business process logic.
Covers: start/end lifecycle, guest invite, heartbeat, viewer count.
"""
import pytest
from django.utils import timezone

from apps.education.models import LiveStream, StreamViewer, StreamGuest
from .conftest import make_client, cabinet_auth, admin_token


# ── Stream start/end lifecycle ────────────────────────────────────────────────

@pytest.mark.django_db
class TestStreamStartAction:
    def test_start_scheduled_stream_goes_live(self, api_client, admin_user, scheduled_stream):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(f'/api/education/streams/{scheduled_stream.id}/start/')
        assert r.status_code == 200
        scheduled_stream.refresh_from_db()
        assert scheduled_stream.status == 'live'
        assert scheduled_stream.started_at is not None

    def test_start_already_live_stream_returns_400(self, api_client, admin_user, live_stream):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(f'/api/education/streams/{live_stream.id}/start/')
        assert r.status_code == 400

    def test_start_ended_stream_returns_400(self, api_client, admin_user, db):
        stream = LiveStream.objects.create(title='Завершённый', status='ended')
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(f'/api/education/streams/{stream.id}/start/')
        assert r.status_code == 400
        stream.refresh_from_db()
        assert stream.status == 'ended'


@pytest.mark.django_db
class TestStreamEndAction:
    def test_end_live_stream_marks_viewers_inactive(self, api_client, admin_user, live_stream, client_a):
        StreamViewer.objects.create(stream=live_stream, client=client_a, is_active=True)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(f'/api/education/streams/{live_stream.id}/end/')
        assert r.status_code == 200
        live_stream.refresh_from_db()
        assert live_stream.status == 'ended'
        viewer = StreamViewer.objects.get(stream=live_stream, client=client_a)
        assert viewer.is_active is False
        assert viewer.left_at is not None

    def test_end_stream_cancels_active_guests(self, api_client, admin_user, live_stream, client_a):
        guest = StreamGuest.objects.create(
            stream=live_stream, client=client_a, status='active',
        )
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        api_client.post(f'/api/education/streams/{live_stream.id}/end/')
        guest.refresh_from_db()
        assert guest.status == 'ended'

    def test_end_stream_cancels_invited_guests(self, api_client, admin_user, live_stream, client_a):
        guest = StreamGuest.objects.create(
            stream=live_stream, client=client_a, status='invited',
        )
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        api_client.post(f'/api/education/streams/{live_stream.id}/end/')
        guest.refresh_from_db()
        assert guest.status == 'ended'

    def test_end_already_ended_stream_returns_400(self, api_client, admin_user, db):
        stream = LiveStream.objects.create(title='Уже завершён', status='ended')
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(f'/api/education/streams/{stream.id}/end/')
        assert r.status_code == 400


# ── Guest invite ──────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestGuestInvite:
    def test_invite_to_live_stream_succeeds(self, api_client, admin_user, live_stream, client_a):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(
            f'/api/education/streams/{live_stream.id}/guests/',
            {'client_id': str(client_a.id)},
            format='json',
        )
        assert r.status_code == 201
        assert StreamGuest.objects.filter(stream=live_stream, client=client_a).exists()

    def test_invite_to_scheduled_stream_returns_400(self, api_client, admin_user, scheduled_stream, client_a):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(
            f'/api/education/streams/{scheduled_stream.id}/guests/',
            {'client_id': str(client_a.id)},
            format='json',
        )
        assert r.status_code == 400

    def test_invite_nonexistent_client_returns_404(self, api_client, admin_user, live_stream):
        import uuid
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(
            f'/api/education/streams/{live_stream.id}/guests/',
            {'client_id': str(uuid.uuid4())},
            format='json',
        )
        assert r.status_code == 404

    def test_invite_malformed_uuid_returns_404(self, api_client, admin_user, live_stream):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(
            f'/api/education/streams/{live_stream.id}/guests/',
            {'client_id': 'not-a-uuid'},
            format='json',
        )
        assert r.status_code == 404

    def test_invite_cancels_existing_active_guest_invite(self, api_client, admin_user, live_stream, client_a):
        old = StreamGuest.objects.create(
            stream=live_stream, client=client_a, status='invited',
        )
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        api_client.post(
            f'/api/education/streams/{live_stream.id}/guests/',
            {'client_id': str(client_a.id)},
            format='json',
        )
        old.refresh_from_db()
        assert old.status == 'ended'
        assert old.deleted_at is not None
        assert StreamGuest.objects.filter(
            stream=live_stream, client=client_a, status='invited', deleted_at__isnull=True,
        ).count() == 1


# ── Heartbeat ─────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestHeartbeat:
    def test_heartbeat_on_live_stream_succeeds(self, api_client, client_a, live_stream):
        StreamViewer.objects.create(stream=live_stream, client=client_a, is_active=True)
        cabinet_auth(api_client, client_a)
        r = api_client.post(f'/api/cabinet/education/streams/{live_stream.id}/heartbeat/')
        assert r.status_code == 200
        assert r.data.get('ok') is True

    def test_heartbeat_on_ended_stream_returns_404(self, api_client, client_a, db):
        stream = LiveStream.objects.create(title='Завершён', status='ended')
        StreamViewer.objects.create(stream=stream, client=client_a, is_active=True)
        cabinet_auth(api_client, client_a)
        r = api_client.post(f'/api/cabinet/education/streams/{stream.id}/heartbeat/')
        assert r.status_code == 404

    def test_heartbeat_unauthenticated_returns_403(self, api_client, live_stream):
        r = api_client.post(f'/api/cabinet/education/streams/{live_stream.id}/heartbeat/')
        assert r.status_code in (401, 403)
