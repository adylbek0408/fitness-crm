"""
Tests for education model constraints and properties.
"""
import pytest
from django.utils import timezone

from apps.education.models import (
    Lesson, LessonProgress, LiveStream, StreamViewer, StreamGuest, Consultation,
)
from .conftest import make_client


@pytest.mark.django_db
class TestLessonModel:
    def test_lesson_creation(self):
        l = Lesson.objects.create(title='Урок 1', lesson_type='video')
        assert l.id is not None
        assert l.is_published is False
        assert l.duration_sec == 0

    def test_lesson_str(self):
        l = Lesson.objects.create(title='Урок видео', lesson_type='video')
        assert 'video' in str(l)


@pytest.mark.django_db
class TestLessonProgressModel:
    def test_unique_together_constraint(self):
        from django.db import IntegrityError
        client = make_client(phone='+71111111111')
        lesson = Lesson.objects.create(title='L', lesson_type='video')
        LessonProgress.objects.create(client=client, lesson=lesson)
        with pytest.raises(IntegrityError):
            LessonProgress.objects.create(client=client, lesson=lesson)

    def test_percent_default_zero(self):
        client = make_client(phone='+71111111112')
        lesson = Lesson.objects.create(title='L2', lesson_type='audio')
        p = LessonProgress.objects.create(client=client, lesson=lesson)
        assert p.percent_watched == 0
        assert p.is_completed is False


@pytest.mark.django_db
class TestLiveStreamModel:
    def test_status_default_scheduled(self):
        s = LiveStream.objects.create(title='Эфир')
        assert s.status == 'scheduled'

    def test_stream_str(self):
        s = LiveStream.objects.create(title='Эфир', status='live')
        assert 'live' in str(s)


@pytest.mark.django_db
class TestStreamViewerModel:
    def test_unique_per_stream_client(self):
        from django.db import IntegrityError
        client = make_client(phone='+71111111113')
        stream = LiveStream.objects.create(title='Стрим')
        StreamViewer.objects.create(stream=stream, client=client)
        with pytest.raises(IntegrityError):
            StreamViewer.objects.create(stream=stream, client=client)

    def test_viewer_active_by_default(self):
        client = make_client(phone='+71111111114')
        stream = LiveStream.objects.create(title='Стрим 2')
        v = StreamViewer.objects.create(stream=stream, client=client)
        assert v.is_active is True


@pytest.mark.django_db
class TestStreamGuestModel:
    def test_default_status_invited(self):
        client = make_client(phone='+71111111115')
        stream = LiveStream.objects.create(title='Стрим 3', status='live')
        g = StreamGuest.objects.create(stream=stream, client=client)
        assert g.status == StreamGuest.STATUS_INVITED

    def test_guest_status_transitions(self):
        client = make_client(phone='+71111111116')
        stream = LiveStream.objects.create(title='Стрим 4', status='live')
        g = StreamGuest.objects.create(stream=stream, client=client, status='invited')
        g.status = 'active'
        g.save(update_fields=['status'])
        g.refresh_from_db()
        assert g.status == 'active'


@pytest.mark.django_db
class TestConsultationModel:
    def test_default_status_active(self):
        from datetime import timedelta
        c = Consultation.objects.create(
            title='Консультация',
            expires_at=timezone.now() + timedelta(days=7),
        )
        assert c.status == 'active'
        assert c.used_count == 0
        assert c.max_uses == 100

    def test_is_consumable_returns_false_when_expired(self):
        from datetime import timedelta
        c = Consultation.objects.create(
            title='Просрочена',
            status='active',
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        assert c.is_consumable is False

    def test_is_consumable_returns_false_when_cancelled(self):
        from datetime import timedelta
        c = Consultation.objects.create(
            title='Отменена',
            status='cancelled',
            expires_at=timezone.now() + timedelta(days=7),
        )
        assert c.is_consumable is False

    def test_is_consumable_returns_true_for_active(self):
        from datetime import timedelta
        c = Consultation.objects.create(
            title='Активна',
            expires_at=timezone.now() + timedelta(days=7),
        )
        assert c.is_consumable is True

    def test_room_uuid_unique(self):
        from datetime import timedelta
        import uuid
        same_uuid = uuid.uuid4()
        Consultation.objects.create(
            title='A', room_uuid=same_uuid,
            expires_at=timezone.now() + timedelta(days=7),
        )
        from django.db import IntegrityError
        with pytest.raises(IntegrityError):
            Consultation.objects.create(
                title='B', room_uuid=same_uuid,
                expires_at=timezone.now() + timedelta(days=7),
            )
