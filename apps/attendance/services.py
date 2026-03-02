from django.db import IntegrityError

from core.services import BaseService
from core.exceptions import NotFoundError, ValidationError

from .models import Attendance
from apps.clients.models import Client


class AttendanceService(BaseService):

    def _get_offline_client(self, client_id: str) -> Client:
        try:
            client = Client.objects.get(id=client_id)
        except Client.DoesNotExist:
            raise NotFoundError(f"Client {client_id} not found")
        if client.training_format != 'offline':
            raise ValidationError("Attendance tracking is only for offline clients")
        return client

    def mark_attendance(self, client_id: str, lesson_date, marked_by=None,
                        is_absent: bool = False, note: str = '') -> Attendance:
        client = self._get_offline_client(client_id)
        try:
            attendance, created = Attendance.objects.get_or_create(
                client=client,
                lesson_date=lesson_date,
                defaults={
                    'is_absent': is_absent,
                    'note': note,
                    'marked_by': marked_by,
                }
            )
            if not created:
                attendance.is_absent = is_absent
                attendance.note = note
                attendance.marked_by = marked_by
                attendance.save(update_fields=['is_absent', 'note', 'marked_by'])
        except IntegrityError:
            raise ValidationError(
                f"Attendance for client {client_id} on {lesson_date} already exists"
            )
        return attendance

    def get_client_attendance(self, client_id: str) -> list:
        self._get_offline_client(client_id)
        return list(
            Attendance.objects.filter(client_id=client_id).order_by('-lesson_date')
        )

    def get_group_attendance_for_date(self, group_id: str, lesson_date) -> list:
        return list(
            Attendance.objects.select_related('client').filter(
                client__group_id=group_id,
                lesson_date=lesson_date
            )
        )
