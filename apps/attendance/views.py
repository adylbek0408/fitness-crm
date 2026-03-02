from datetime import datetime

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .serializers import AttendanceSerializer, AttendanceMarkSerializer, BulkAttendanceMarkSerializer
from .services import AttendanceService


class AttendanceViewSet(viewsets.GenericViewSet):
    service = AttendanceService()

    def get_permissions(self):
        return [IsAuthenticated()]

    @action(detail=False, methods=['post'], url_path='mark')
    def mark(self, request):
        serializer = AttendanceMarkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        record = self.service.mark_attendance(
            client_id=str(d['client_id']),
            lesson_date=d['lesson_date'],
            marked_by=request.user,
            is_absent=d['is_absent'],
            note=d.get('note', '')
        )
        return Response(AttendanceSerializer(record).data)

    @action(detail=False, methods=['post'], url_path='bulk-mark')
    def bulk_mark(self, request):
        serializer = BulkAttendanceMarkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lesson_date = serializer.validated_data['lesson_date']
        results = []
        for rec in serializer.validated_data['records']:
            record = self.service.mark_attendance(
                client_id=str(rec['client_id']),
                lesson_date=lesson_date,
                marked_by=request.user,
                is_absent=rec['is_absent'],
                note=rec.get('note', '')
            )
            results.append(record)
        return Response(AttendanceSerializer(results, many=True).data)

    @action(detail=False, methods=['get'], url_path=r'group/(?P<group_id>[^/.]+)')
    def by_group(self, request, group_id=None):
        lesson_date_str = request.query_params.get('date')
        if not lesson_date_str:
            return Response(
                {'detail': 'date query param required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            lesson_date = datetime.strptime(lesson_date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'detail': 'Invalid date format. Use YYYY-MM-DD'},
                status=status.HTTP_400_BAD_REQUEST
            )
        records = self.service.get_group_attendance_for_date(group_id, lesson_date)
        return Response(AttendanceSerializer(records, many=True).data)
