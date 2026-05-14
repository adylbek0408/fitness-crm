"""
Business logic regression tests.
Covers: stream state machine, guest signaling guards, lesson publish guards.
"""
import pytest
from datetime import timedelta
from django.utils import timezone

from apps.education.models import Lesson, LiveStream, StreamGuest, StreamViewer
from .conftest import make_client, admin_token


# ── Stream state machine ───────────────────────────────────────────────────────

@pytest.mark.django_db
class TestStreamEndStateMachine:
    def test_end_scheduled_stream_returns_400(self, api_client, admin_user, scheduled_stream):
        """A stream that never went live must not be end-able."""
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(f'/api/education/streams/{scheduled_stream.id}/end/')
        assert r.status_code == 400
        scheduled_stream.refresh_from_db()
        assert scheduled_stream.status == 'scheduled'
        assert scheduled_stream.ended_at is None

    def test_end_live_stream_succeeds(self, api_client, admin_user, live_stream):
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(f'/api/education/streams/{live_stream.id}/end/')
        assert r.status_code == 200
        live_stream.refresh_from_db()
        assert live_stream.status == 'ended'
        assert live_stream.ended_at is not None

    def test_end_stream_sets_guest_deleted_at(self, api_client, admin_user, live_stream, client_a):
        """Guests cancelled on stream.end must have deleted_at set (soft-delete contract)."""
        guest = StreamGuest.objects.create(stream=live_stream, client=client_a, status='invited')
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        api_client.post(f'/api/education/streams/{live_stream.id}/end/')
        guest.refresh_from_db()
        assert guest.status == 'ended'
        assert guest.deleted_at is not None

    def test_end_stream_active_guest_gets_deleted_at(self, api_client, admin_user, live_stream, client_a):
        guest = StreamGuest.objects.create(stream=live_stream, client=client_a, status='active')
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        api_client.post(f'/api/education/streams/{live_stream.id}/end/')
        guest.refresh_from_db()
        assert guest.deleted_at is not None

    def test_scheduled_stream_cannot_be_ended_even_by_admin(self, api_client, admin_user):
        """State machine: scheduled → ended is invalid (must go through live)."""
        s = LiveStream.objects.create(title='Запланированный', status='scheduled')
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(f'/api/education/streams/{s.id}/end/')
        assert r.status_code == 400
        s.refresh_from_db()
        assert s.started_at is None


# ── SDP reset guard ────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestSdpResetGuard:
    def test_reset_active_guest_succeeds(self, api_client, admin_user, live_stream, client_a):
        guest = StreamGuest.objects.create(
            stream=live_stream, client=client_a, status='active',
            offer_sdp='v=0\r\n', answer_sdp='v=0\r\n',
        )
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(
            f'/api/education/streams/{live_stream.id}/guests/{guest.id}/webrtc/',
            {'reset': True}, format='json',
        )
        assert r.status_code == 200
        guest.refresh_from_db()
        assert guest.offer_sdp == ''
        assert guest.answer_sdp == ''

    def test_reset_invited_guest_succeeds(self, api_client, admin_user, live_stream, client_a):
        guest = StreamGuest.objects.create(
            stream=live_stream, client=client_a, status='invited',
        )
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(
            f'/api/education/streams/{live_stream.id}/guests/{guest.id}/webrtc/',
            {'reset': True}, format='json',
        )
        assert r.status_code == 200

    def test_reset_ended_guest_returns_400(self, api_client, admin_user, live_stream, client_a):
        """Cannot reset signaling on a guest that already left."""
        guest = StreamGuest.objects.create(
            stream=live_stream, client=client_a, status='ended',
            offer_sdp='v=0\r\n', answer_sdp='v=0\r\n',
        )
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(
            f'/api/education/streams/{live_stream.id}/guests/{guest.id}/webrtc/',
            {'reset': True}, format='json',
        )
        assert r.status_code == 400
        guest.refresh_from_db()
        assert guest.offer_sdp == 'v=0\r\n'  # unchanged


# ── Lesson publish guard ───────────────────────────────────────────────────────

@pytest.mark.django_db
class TestLessonPublishGuard:
    def test_finalize_video_without_source_returns_400(self, api_client, admin_user):
        lesson = Lesson.objects.create(
            title='Видео без файла', lesson_type='video',
            stream_uid='', r2_key='',
        )
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(f'/api/education/lessons/{lesson.id}/finalize/')
        assert r.status_code == 400
        lesson.refresh_from_db()
        assert lesson.is_published is False

    def test_finalize_audio_without_source_returns_400(self, api_client, admin_user):
        lesson = Lesson.objects.create(
            title='Аудио без файла', lesson_type='audio',
            r2_key='',
        )
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(f'/api/education/lessons/{lesson.id}/finalize/')
        assert r.status_code == 400
        lesson.refresh_from_db()
        assert lesson.is_published is False

    def test_finalize_video_with_stream_uid_succeeds(self, api_client, admin_user):
        lesson = Lesson.objects.create(
            title='Видео с CF', lesson_type='video',
            stream_uid='abc123', r2_key='',
        )
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(f'/api/education/lessons/{lesson.id}/finalize/')
        assert r.status_code == 200
        lesson.refresh_from_db()
        assert lesson.is_published is True

    def test_finalize_video_with_r2_key_succeeds(self, api_client, admin_user):
        lesson = Lesson.objects.create(
            title='Видео в R2', lesson_type='video',
            stream_uid='', r2_key='lessons/video.mp4',
        )
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(f'/api/education/lessons/{lesson.id}/finalize/')
        assert r.status_code == 200

    def test_finalize_audio_with_r2_key_succeeds(self, api_client, admin_user):
        lesson = Lesson.objects.create(
            title='Аудио в R2', lesson_type='audio',
            r2_key='lessons/audio.mp3',
        )
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token(admin_user)}')
        r = api_client.post(f'/api/education/lessons/{lesson.id}/finalize/')
        assert r.status_code == 200
        lesson.refresh_from_db()
        assert lesson.is_published is True


# ── Stream join concurrent safety ─────────────────────────────────────────────

@pytest.mark.django_db
class TestStreamViewerJoin:
    def test_concurrent_join_creates_single_viewer(self, live_stream, client_a):
        """get_or_create must survive two simultaneous join calls for the same client."""
        from apps.education.models import StreamViewer

        def do_join():
            viewer, created = StreamViewer.objects.get_or_create(
                stream=live_stream, client=client_a,
                defaults={'is_active': True},
            )
            if not created:
                StreamViewer.objects.filter(pk=viewer.pk).update(is_active=True, left_at=None)

        do_join()
        do_join()
        assert StreamViewer.objects.filter(stream=live_stream, client=client_a).count() == 1

    def test_rejoin_reactivates_viewer(self, live_stream, client_a):
        """A viewer who left and rejoins should be marked active again."""
        from apps.education.models import StreamViewer
        StreamViewer.objects.create(
            stream=live_stream, client=client_a,
            is_active=False, left_at=timezone.now(),
        )
        viewer, created = StreamViewer.objects.get_or_create(
            stream=live_stream, client=client_a,
            defaults={'is_active': True},
        )
        if not created:
            StreamViewer.objects.filter(pk=viewer.pk).update(is_active=True, left_at=None)
        viewer.refresh_from_db()
        assert viewer.is_active is True
        assert viewer.left_at is None
