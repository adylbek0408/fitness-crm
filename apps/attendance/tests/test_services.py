import pytest
from decimal import Decimal
from datetime import date

from core.exceptions import ValidationError

from apps.clients.models import Client
from apps.attendance.models import Attendance
from apps.attendance.services import AttendanceService
from apps.payments.models import FullPayment


@pytest.mark.django_db
class TestAttendanceService:
    def test_mark_attendance_for_offline_client(self):
        client = Client.objects.create(
            first_name='John',
            last_name='Doe',
            phone='+79991234567',
            training_format='offline',
            group_type='1.5h',
            payment_type='full'
        )
        FullPayment.objects.create(client=client, amount=Decimal('5000.00'))
        service = AttendanceService()
        attendance = service.mark_attendance(str(client.id), date(2025, 3, 1), is_absent=False)
        assert attendance.client == client
        assert attendance.lesson_date == date(2025, 3, 1)
        assert attendance.is_absent is False

    def test_mark_attendance_for_online_client_raises(self):
        client = Client.objects.create(
            first_name='Jane',
            last_name='Smith',
            phone='+79991234568',
            training_format='online',
            group_type='1.5h',
            payment_type='full'
        )
        FullPayment.objects.create(client=client, amount=Decimal('5000.00'))
        service = AttendanceService()
        with pytest.raises(ValidationError) as exc_info:
            service.mark_attendance(str(client.id), date(2025, 3, 1))
        assert 'offline' in str(exc_info.value).lower()

    def test_mark_attendance_updates_existing(self):
        client = Client.objects.create(
            first_name='Bob',
            last_name='Brown',
            phone='+79991234569',
            training_format='offline',
            group_type='1.5h',
            payment_type='full'
        )
        FullPayment.objects.create(client=client, amount=Decimal('5000.00'))
        Attendance.objects.create(
            client=client,
            lesson_date=date(2025, 3, 1),
            is_absent=False,
            note='Initial'
        )
        service = AttendanceService()
        attendance = service.mark_attendance(
            str(client.id),
            date(2025, 3, 1),
            is_absent=True,
            note='Updated'
        )
        assert attendance.is_absent is True
        assert attendance.note == 'Updated'

    def test_get_client_attendance_returns_list(self):
        client = Client.objects.create(
            first_name='Alice',
            last_name='White',
            phone='+79991234570',
            training_format='offline',
            group_type='1.5h',
            payment_type='full'
        )
        FullPayment.objects.create(client=client, amount=Decimal('5000.00'))
        Attendance.objects.create(client=client, lesson_date=date(2025, 3, 1))
        Attendance.objects.create(client=client, lesson_date=date(2025, 3, 2))
        service = AttendanceService()
        result = service.get_client_attendance(str(client.id))
        assert len(result) == 2
        assert result[0].lesson_date == date(2025, 3, 2)
        assert result[1].lesson_date == date(2025, 3, 1)
