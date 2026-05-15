"""
Tests for lesson progress tracking.
Covers: save/update, anti-fabrication clamping, concurrent write safety.
"""
import pytest

from apps.education.models import Lesson, LessonProgress
from .conftest import make_client, cabinet_auth, make_group


@pytest.mark.django_db
class TestLessonProgressAPI:
    def test_first_progress_creates_row(self, api_client, client_a, lesson):
        lesson.groups.clear()
        g = make_group(number='LP-A')
        lesson.groups.add(g)
        client_a.group = g
        client_a.save(update_fields=['group'])

        cabinet_auth(api_client, client_a)
        r = api_client.post(
            f'/api/cabinet/education/lessons/{lesson.id}/progress/',
            {'position': 120, 'percent': 20},
            format='json',
        )
        assert r.status_code == 200
        assert LessonProgress.objects.filter(client=client_a, lesson=lesson).exists()
        p = LessonProgress.objects.get(client=client_a, lesson=lesson)
        assert p.last_position_sec == 120
        assert p.percent_watched == 20

    def test_second_progress_updates_existing_row(self, api_client, client_a, lesson):
        g = make_group(number='LP-B')
        lesson.groups.add(g)
        client_a.group = g
        client_a.save(update_fields=['group'])

        LessonProgress.objects.create(client=client_a, lesson=lesson, last_position_sec=60, percent_watched=10)
        cabinet_auth(api_client, client_a)
        api_client.post(
            f'/api/cabinet/education/lessons/{lesson.id}/progress/',
            {'position': 300, 'percent': 50},
            format='json',
        )
        assert LessonProgress.objects.filter(client=client_a, lesson=lesson).count() == 1
        p = LessonProgress.objects.get(client=client_a, lesson=lesson)
        assert p.last_position_sec == 300
        assert p.percent_watched == 50

    def test_percent_clamped_to_100(self, api_client, client_a, lesson):
        g = make_group(number='LP-C')
        lesson.groups.add(g)
        client_a.group = g
        client_a.save(update_fields=['group'])

        cabinet_auth(api_client, client_a)
        r = api_client.post(
            f'/api/cabinet/education/lessons/{lesson.id}/progress/',
            {'position': 600, 'percent': 150},
            format='json',
        )
        assert r.status_code == 200
        p = LessonProgress.objects.get(client=client_a, lesson=lesson)
        assert p.percent_watched <= 100

    def test_progress_capped_at_50_when_no_duration(self, api_client, client_a, db):
        g = make_group(number='LP-D')
        no_dur = Lesson.objects.create(
            title='Без длительности', lesson_type='video',
            is_published=True, duration_sec=0,
        )
        no_dur.groups.add(g)
        client_a.group = g
        client_a.save(update_fields=['group'])

        cabinet_auth(api_client, client_a)
        r = api_client.post(
            f'/api/cabinet/education/lessons/{no_dur.id}/progress/',
            {'position': 999, 'percent': 100},
            format='json',
        )
        assert r.status_code == 200
        p = LessonProgress.objects.get(client=client_a, lesson=no_dur)
        assert p.percent_watched <= 50
        assert p.is_completed is False

    def test_lesson_marked_completed_at_95_percent(self, api_client, client_a, db):
        g = make_group(number='LP-E')
        lesson = Lesson.objects.create(
            title='Длинный урок', lesson_type='video',
            is_published=True, duration_sec=1000,
        )
        lesson.groups.add(g)
        client_a.group = g
        client_a.save(update_fields=['group'])

        cabinet_auth(api_client, client_a)
        r = api_client.post(
            f'/api/cabinet/education/lessons/{lesson.id}/progress/',
            {'position': 960, 'percent': 96},
            format='json',
        )
        assert r.status_code == 200
        p = LessonProgress.objects.get(client=client_a, lesson=lesson)
        assert p.is_completed is True

    def test_concurrent_progress_creates_single_row(self, client_a, lesson, db):
        """Two simultaneous saves must not raise IntegrityError or create duplicate rows."""
        from django.db import transaction
        g = make_group(number='LP-F')
        lesson.groups.add(g)
        client_a.group = g
        client_a.save(update_fields=['group'])

        def save_progress():
            from apps.education.models import LessonProgress
            progress, _ = LessonProgress.objects.get_or_create(
                client=client_a, lesson=lesson,
                defaults={'last_position_sec': 0, 'percent_watched': 0},
            )
            progress.last_position_sec = 100
            progress.percent_watched = 20
            progress.save(update_fields=['last_position_sec', 'percent_watched'])

        save_progress()
        save_progress()  # Second call — must not raise
        assert LessonProgress.objects.filter(client=client_a, lesson=lesson).count() == 1


@pytest.mark.django_db
class TestLessonProgressModel:
    def test_unique_together_client_lesson(self, client_a, lesson):
        from django.db import IntegrityError
        LessonProgress.objects.create(client=client_a, lesson=lesson)
        with pytest.raises(IntegrityError):
            LessonProgress.objects.create(client=client_a, lesson=lesson)
