"""
Cabinet API: login (username/password -> JWT), me (profile: first_name, last_name, balance).
"""
import requests as http_requests

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

import jwt

from .cabinet_auth import CabinetJWTAuthentication, create_cabinet_tokens, CABINET_TOKEN_TYPE
from .models import ClientAccount, Client


class CabinetLoginThrottle(AnonRateThrottle):
    """10 login attempts per minute per IP — brute-force protection."""
    scope = 'cabinet_login'

    def get_rate(self):
        return '10/minute'


class CabinetLoginView(APIView):
    authentication_classes = []   # ← Отключаем аутентификацию: протухший cabinet-токен
    permission_classes = [AllowAny]  # не должен блокировать вход
    throttle_classes = [CabinetLoginThrottle]

    def post(self, request):
        username = (request.data.get('username') or request.data.get('login') or '').strip()
        password = (request.data.get('password') or '').strip()
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


class CabinetGoogleAuthView(APIView):
    """
    POST /api/cabinet/google-auth/
    Body: { "credential": "<Google ID token>" }

    Verify Google ID token, find matching ClientAccount by google_id or
    google_email, return cabinet JWT pair.

    Matching order:
    1. google_id match  — fastest, immutable, most secure
    2. google_email match — for first-time login after manager pre-filled email;
       saves google_id so subsequent logins use rule #1
    3. No match → 404 with instructions to contact manager
    """
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [CabinetLoginThrottle]

    def post(self, request):
        credential = request.data.get('credential', '').strip()
        if not credential:
            return Response({'detail': 'credential required'}, status=status.HTTP_400_BAD_REQUEST)

        google_client_id = getattr(settings, 'GOOGLE_CLIENT_ID', '')
        if not google_client_id:
            return Response(
                {'detail': 'Google login not configured on server.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # Verify token with Google tokeninfo endpoint
        try:
            resp = http_requests.get(
                'https://oauth2.googleapis.com/tokeninfo',
                params={'id_token': credential},
                timeout=5,
            )
            if resp.status_code != 200:
                return Response({'detail': 'Invalid Google token.'}, status=status.HTTP_401_UNAUTHORIZED)
            info = resp.json()
        except Exception:
            return Response({'detail': 'Could not verify Google token.'}, status=status.HTTP_401_UNAUTHORIZED)

        # Verify audience matches our app
        if info.get('aud') != google_client_id:
            return Response({'detail': 'Token audience mismatch.'}, status=status.HTTP_401_UNAUTHORIZED)

        google_id = info.get('sub', '')
        google_email = info.get('email', '').lower()

        if not google_id:
            return Response({'detail': 'Invalid Google token payload.'}, status=status.HTTP_401_UNAUTHORIZED)

        # 1. Match by google_id (most common path after first login)
        account = ClientAccount.objects.select_related('client').filter(
            google_id=google_id,
            client__deleted_at__isnull=True,
        ).first()

        if account is None and google_email:
            # 2. Match by google_email (first login — manager pre-filled email)
            account = ClientAccount.objects.select_related('client').filter(
                google_email__iexact=google_email,
                client__deleted_at__isnull=True,
            ).first()
            if account:
                # Save google_id so future logins skip email lookup
                account.google_id = google_id
                account.save(update_fields=['google_id'])

        if account is None:
            return Response(
                {'detail': 'Аккаунт не найден. Обратитесь к менеджеру.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        tokens = create_cabinet_tokens(account.client)
        return Response({'access': tokens['access'], 'refresh': tokens['refresh']})


class CabinetTokenRefreshView(APIView):
    """
    POST /api/cabinet/token/refresh/
    Body: { "refresh": "<cabinet refresh token>" }
    Returns a new short-lived access token without rotating the session.
    """
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        from datetime import datetime as _dt, timedelta, timezone as dt_tz

        refresh_token = (request.data.get('refresh') or '').strip()
        if not refresh_token:
            return Response({'detail': 'refresh required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            payload = jwt.decode(refresh_token, settings.SECRET_KEY, algorithms=['HS256'])
        except jwt.ExpiredSignatureError:
            return Response({'detail': 'Refresh token expired.'}, status=status.HTTP_401_UNAUTHORIZED)
        except jwt.InvalidTokenError:
            return Response({'detail': 'Invalid token.'}, status=status.HTTP_401_UNAUTHORIZED)

        if payload.get('type') != CABINET_TOKEN_TYPE:
            return Response({'detail': 'Invalid token type.'}, status=status.HTTP_401_UNAUTHORIZED)
        if payload.get('token_type') != 'refresh':
            return Response({'detail': 'Not a refresh token.'}, status=status.HTTP_401_UNAUTHORIZED)

        client_id = payload.get('client_id')
        session_key = payload.get('session_key', '')

        try:
            account = ClientAccount.objects.select_related('client').get(
                client__id=client_id,
                client__deleted_at__isnull=True,
            )
        except ClientAccount.DoesNotExist:
            return Response({'detail': 'Client not found.'}, status=status.HTTP_401_UNAUTHORIZED)

        stored = account.session_key or ''
        if stored and stored != session_key:
            return Response({'detail': 'Session expired. Please log in again.'}, status=status.HTTP_401_UNAUTHORIZED)

        now = _dt.now(dt_tz.utc)
        new_payload = {
            'client_id': str(client_id),
            'type': CABINET_TOKEN_TYPE,
            'session_key': session_key,
            'exp': now + timedelta(days=1),
            'iat': now,
        }
        access = jwt.encode(new_payload, settings.SECRET_KEY, algorithm='HS256')
        return Response({'access': access})


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
        try:
            limit = int(request.query_params.get('limit', 50))
        except (TypeError, ValueError):
            limit = 50
        # Cap to prevent DoS via huge limit (~caller controls memory + DB load).
        limit = max(1, min(limit, 500))
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
        client = Client.objects.select_related('group', 'second_group').filter(
            pk=account.client_id, deleted_at__isnull=True,
        ).first()
        if not client:
            return Response({'detail': 'Аккаунт не найден.'}, status=status.HTTP_404_NOT_FOUND)
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

        # Завершённые потоки из ClientGroupHistory
        from .models import ClientGroupHistory
        completed_flows = [
            {'number': h.group_number, 'group_type': h.group_type}
            for h in ClientGroupHistory.objects.filter(client=client).order_by('-ended_at')
        ]

        # Installment payment access check
        has_lesson_access = True
        if client.payment_type == 'installment':
            from apps.payments.models import InstallmentPlan
            plan = InstallmentPlan.objects.filter(client=client).order_by('-created_at').first()
            has_lesson_access = bool(plan and plan.is_closed)

        second_group = None
        if client.second_group_id:
            g2 = client.second_group
            second_group = {
                'number': g2.number,
                'status': g2.status,
                'group_type': g2.group_type,
                'schedule': g2.schedule or '',
                'start_date': str(g2.start_date) if g2.start_date else '',
                'trainer': g2.trainer.full_name if g2.trainer_id else '',
            }

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
            'second_group': second_group,
            'completed_flows': completed_flows,
            'has_lesson_access': has_lesson_access,
        })
