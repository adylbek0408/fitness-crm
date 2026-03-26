"""
Cabinet API: login (username/password -> JWT), me (profile: first_name, last_name, balance).
"""
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .cabinet_auth import CabinetJWTAuthentication, create_cabinet_tokens
from .models import ClientAccount, Client


class CabinetLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username') or request.data.get('login')
        password = request.data.get('password')
        if not username or not password:
            return Response(
                {'detail': 'username and password required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            account = ClientAccount.objects.select_related('client').get(username=username)
        except ClientAccount.DoesNotExist:
            return Response(
                {'detail': 'Invalid credentials'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if not account.check_password(password):
            return Response(
                {'detail': 'Invalid credentials'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        tokens = create_cabinet_tokens(account.client)
        return Response({
            'access': tokens['access'],
            'refresh': tokens['refresh'],
        })


class CabinetAttendanceView(APIView):
    """
    GET /api/cabinet/attendance/
    Returns attendance records for the authenticated cabinet client.
    Query params: limit (default 50)
    """
    authentication_classes = [CabinetJWTAuthentication]

    def get_permissions(self):
        from .cabinet_permissions import IsCabinetClient
        return [IsCabinetClient()]

    def get(self, request):
        from apps.attendance.models import Attendance
        account = request.user
        limit = int(request.query_params.get('limit', 50))
        records = (
            Attendance.objects
            .filter(client_id=account.client_id)
            .order_by('-lesson_date')[:limit]
        )
        data = [
            {
                'lesson_date': str(r.lesson_date),
                'is_absent': r.is_absent,
                'note': r.note or '',
            }
            for r in records
        ]
        total = Attendance.objects.filter(client_id=account.client_id).count()
        absent = Attendance.objects.filter(client_id=account.client_id, is_absent=True).count()
        present = Attendance.objects.filter(client_id=account.client_id, is_absent=False).count()
        return Response({
            'records': data,
            'total': total,
            'absent': absent,
            'present': present,
        })


class CabinetMeView(APIView):
    authentication_classes = [CabinetJWTAuthentication]
    permission_classes = []  # only cabinet-authenticated can reach this

    def get_permissions(self):
        from .cabinet_permissions import IsCabinetClient
        return [IsCabinetClient()]

    def get(self, request):
        account = request.user  # ClientAccount from CabinetJWTAuthentication
        client = Client.objects.select_related('group').get(pk=account.client_id)
        # Полный номер — свой кабинет, клиент видит свой номер
        phone = (client.phone or '').strip() or '—'

        current_group = None
        if client.group_id:
            g = client.group
            current_group = {
                'number': g.number,
                'status': g.status,
                'group_type': g.group_type,
                'schedule': g.schedule or '',
                'start_date': str(g.start_date) if g.start_date else '',
                'trainer': g.trainer.full_name if g.trainer_id else '',
            }

        # Завершённые потоки: пока только текущий статус клиента; истории потоков в БД нет
        completed_flows = []
        if client.status == 'completed' and client.group_id:
            completed_flows = [{'number': client.group.number, 'group_type': client.group.group_type}]

        return Response({
            'first_name': client.first_name,
            'last_name': client.last_name,
            'balance': str(client.bonus_balance) if client.bonus_balance is not None else '0',
            'phone': phone,
            'training_format': client.training_format,
            'group_type': client.group_type,
            'registered_at': str(client.registered_at) if client.registered_at else None,
            'status': client.status,
            'current_group': current_group,
            'completed_flows': completed_flows,
        })
