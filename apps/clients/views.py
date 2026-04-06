from decimal import Decimal, InvalidOperation

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Prefetch, Count
from django.utils import timezone

from core.permissions import IsAdmin, IsAdminOrRegistrar
from core.exceptions import ValidationError, NotFoundError
from .models import Client, ClientGroupHistory
from .serializers import ClientReadSerializer, ClientCreateSerializer, ClientUpdateSerializer
from .services import ClientService
from .filters import ClientFilter
from apps.payments.models import FullPayment, InstallmentPlan


class ClientViewSet(viewsets.ModelViewSet):
    service = ClientService()
    filterset_class = ClientFilter
    search_fields = ['first_name', 'last_name', 'phone']
    ordering_fields = ['registered_at', 'last_name', 'status']

    def get_queryset(self):
        return Client.objects.filter(deleted_at__isnull=True).select_related(
            'group', 'trainer', 'registered_by', 'cabinet_account'
        ).prefetch_related(
            Prefetch('full_payments', queryset=FullPayment.objects.order_by('-created_at')),
            Prefetch('installment_plans', queryset=InstallmentPlan.objects.order_by('-created_at').prefetch_related('payments')),
        ).order_by('-registered_at')

    def get_permissions(self):
        if self.action == 'create':
            return [IsAdminOrRegistrar()]
        if self.action in ['update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == 'create':
            return ClientCreateSerializer
        if self.action in ['update', 'partial_update']:
            return ClientUpdateSerializer
        return ClientReadSerializer

    def create(self, request, *args, **kwargs):
        serializer = ClientCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data.copy()
        if data.get('group'):
            data['group_id'] = str(data.pop('group').id)
        else:
            data.pop('group', None)
        if data.get('trainer'):
            data['trainer_id'] = str(data.pop('trainer').id)
        else:
            data.pop('trainer', None)
        client = self.service.create_client(data, registered_by=request.user)
        out = ClientReadSerializer(client).data
        if getattr(client, '_cabinet_username_plain', None):
            out['cabinet_username'] = client._cabinet_username_plain
            out['cabinet_password'] = client._cabinet_password_plain
        return Response(out, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = ClientUpdateSerializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data.copy()
        if 'group' in data:
            data['group_id'] = str(data.pop('group').id) if data['group'] else None
        if 'trainer' in data:
            data['trainer_id'] = str(data.pop('trainer').id) if data['trainer'] else None
        client = self.service.update_client(str(instance.id), data)
        return Response(ClientReadSerializer(client).data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.deleted_at = timezone.now()
        instance.save(update_fields=['deleted_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'], url_path='stats-summary')
    def stats_summary(self, request):
        qs = self.filter_queryset(self.get_queryset())
        total = qs.count()
        by_status = {r['status']: r['c'] for r in qs.values('status').annotate(c=Count('id'))}
        return Response({'total': total, 'by_status': by_status})

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrRegistrar])
    def change_status(self, request, pk=None):
        new_status = request.data.get('status')
        client = self.service.change_status(pk, new_status)
        return Response(ClientReadSerializer(client).data)

    @action(detail=True, methods=['get'])
    def attendance(self, request, pk=None):
        from apps.attendance.services import AttendanceService
        from apps.attendance.serializers import AttendanceSerializer
        records = AttendanceService().get_client_attendance(pk)
        return Response(AttendanceSerializer(records, many=True).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrRegistrar])
    def reset_cabinet_password(self, request, pk=None):
        try:
            plain = self.service.reset_cabinet_password(pk)
            return Response({'password': plain})
        except ValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='group-history')
    def group_history(self, request, pk=None):
        """
        GET /api/clients/{id}/group-history/
        Возвращает историю завершённых потоков клиента.
        """
        records = ClientGroupHistory.objects.filter(client_id=pk).order_by('-ended_at')
        data = [
            {
                'id':                str(r.id),
                'group_id':          str(r.group_id) if r.group_id else None,
                'group_number':      r.group_number,
                'group_type':        r.group_type,
                'trainer_name':      r.trainer_name,
                'start_date':        str(r.start_date) if r.start_date else None,
                'ended_at':          str(r.ended_at),
                'payment_type':      r.payment_type,
                'payment_amount':    str(r.payment_amount),
                'payment_paid':      str(r.payment_paid),
                'payment_is_closed': r.payment_is_closed,
                'receipts':          r.receipts if r.receipts else [],
            }
            for r in records
        ]
        return Response(data)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrRegistrar], url_path='add-to-group')
    def add_to_group(self, request, pk=None):
        """
        POST /api/clients/{id}/add-to-group/
        Клиент со статусом «Новый», оплата закрыта — запись в поток без новой оплаты.
        Body: { "group_id": "<uuid>" }
        """
        gid = request.data.get('group_id')
        if not gid:
            return Response({'detail': 'group_id обязателен'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            client = self.service.add_new_client_to_group(pk, str(gid))
        except ValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except NotFoundError as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)
        return Response(ClientReadSerializer(client).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrRegistrar], url_path='re-enroll')
    def re_enroll(self, request, pk=None):
        """
        POST /api/clients/{id}/re-enroll/
        Повторная запись клиента: новая оплата + запись в группу.
        Body: { group_id, payment_type, payment_data: {amount} | {total_cost, deadline},
                bonus_percent?: 0–100 (процент бонуса с этой оплаты) }
        """
        client = self.service.re_enroll_client(pk, request.data, user=request.user)
        return Response(ClientReadSerializer(client).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrRegistrar], url_path='refund')
    def refund(self, request, pk=None):
        """
        POST /api/clients/{id}/refund/
        Body: { "retention_amount": "2100" } — удержание компании; к клиенту = оплачено − удержание.
        """
        raw = request.data.get('retention_amount', 0)
        try:
            s = str(raw).replace(',', '.').strip() if raw is not None else '0'
            retention = Decimal(s) if s else Decimal('0')
        except InvalidOperation:
            return Response({'detail': 'Некорректная сумма удержания'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = self.service.refund_client(
                pk, user=request.user, retention_amount=retention
            )
        except ValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)
