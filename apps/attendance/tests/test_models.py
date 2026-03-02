import pytest
from datetime import date

from django.db import IntegrityError

from apps.clients.models import Client
from apps.attendance.models import Attendance


@pytest.mark.django_db
class TestAttendanceModel:
    def test_attendance_creation(self):
        client = Client.objects.create(
            first_name='John',
            last_name='Doe',
            phone='+79991234567',
            training_format='offline',
            group_type='1.5h',
            payment_type='full'
        )
        att = Attendance.objects.create(
            client=client,
            lesson_date=date(2025, 3, 1),
            is_absent=False
        )
        assert att.client == client
        assert att.lesson_date == date(2025, 3, 1)
        assert att.is_absent is False

    def test_attendance_unique_constraint(self):
        client = Client.objects.create(
            first_name='John',
            last_name='Doe',
            phone='+79991234568',
            training_format='offline',
            group_type='1.5h',
            payment_type='full'
        )
        Attendance.objects.create(
            client=client,
            lesson_date=date(2025, 3, 1)
        )
        with pytest.raises(IntegrityError):
            Attendance.objects.create(
                client=client,
                lesson_date=date(2025, 3, 1)
            )

    def test_attendance_str_absent(self):
        client = Client.objects.create(
            first_name='Jane',
            last_name='Smith',
            phone='+79991234569',
            training_format='offline',
            group_type='1.5h',
            payment_type='full'
        )
        att = Attendance.objects.create(
            client=client,
            lesson_date=date(2025, 3, 1),
            is_absent=True
        )
        assert str(att) == f'{client} — 2025-03-01 — absent'

    def test_attendance_str_present(self):
        client = Client.objects.create(
            first_name='Bob',
            last_name='Brown',
            phone='+79991234570',
            training_format='offline',
            group_type='1.5h',
            payment_type='full'
        )
        att = Attendance.objects.create(
            client=client,
            lesson_date=date(2025, 3, 1),
            is_absent=False
        )
        assert str(att) == f'{client} — 2025-03-01 — present'
