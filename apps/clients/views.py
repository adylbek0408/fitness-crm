from decimal import Decimal, InvalidOperation

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Prefetch, Count
from django.utils import timezone

from core.permissions import IsAdmin, IsAdminOrRegistrar
from core.exceptions import ValidationError, NotFoundError
from .models import Client, ClientGroupHistory, ClientStatusHistory
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
        qs = Client.objects.filter(deleted_at__isnull=True).select_related(
            'group', 'trainer', 'registered_by', 'cabinet_account'
        ).prefetch_related(
            Prefetch('full_payments', queryset=FullPayment.objects.order_by('-created_at')),
            Prefetch('installment_plans', queryset=InstallmentPlan.objects.order_by('-created_at').prefetch_related('payments')),
        ).order_by('-registered_at')

        user = self.request.user
        role = getattr(user, 'role', None)
        if not (user.is_superuser or role == 'admin'):
            from django.db.models import Q
            from apps.accounts.models import ManagerProfile
            mp = ManagerProfile.objects.filter(user_id=user.pk).first()
            snap = ''
            if mp:
                snap = f'{mp.last_name} {mp.first_name}'.strip()
            if snap:
                qs = qs.filter(
                    Q(registered_by_id=user.pk) | Q(registered_by_name__iexact=snap)
                ).distinct()
            else:
                qs = qs.filter(registered_by_id=user.pk)
        return qs

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
        try:
            client = self.service.create_client(data, registered_by=request.user)
        except ValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except NotFoundError as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)
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
        try:
            client = self.service.update_client(str(instance.id), data)
        except ValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ClientReadSerializer(client).data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.deleted_at = timezone.now()
        instance.save(update_fields=['deleted_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'], url_path='stats-summary')
    def stats_summary(self, request):
        simple_qs = Client.objects.filter(deleted_at__isnull=True)
        qs = self.filter_queryset(simple_qs)
        total = qs.count()
        by_status = {
            r['status']: r['c']
            for r in qs.values('status').annotate(c=Count('id', distinct=True))
        }
        return Response({'total': total, 'by_status': by_status})

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrRegistrar])
    def change_status(self, request, pk=None):
        new_status = request.data.get('status')
        try:
            client = self.service.change_status(pk, new_status, user=request.user)
        except ValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except NotFoundError as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)
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

    @action(detail=True, methods=['get'], url_path='status-history')
    def status_history(self, request, pk=None):
        """История смен статусов клиента."""
        records = ClientStatusHistory.objects.filter(client_id=pk).order_by('-created_at')
        STATUS_LABEL = {
            '': '—', 'new': 'Новый', 'trial': 'Пробный',
            'active': 'Активный', 'completed': 'Завершил',
            'expelled': 'Отчислен', 'frozen': 'Заморозка',
        }
        data = [
            {
                'id':              str(r.id),
                'old_status':      r.old_status,
                'old_status_label': STATUS_LABEL.get(r.old_status, r.old_status),
                'new_status':      r.new_status,
                'new_status_label': STATUS_LABEL.get(r.new_status, r.new_status),
                'changed_by_name': r.changed_by_name or (
                    r.changed_by.username if r.changed_by_id else ''
                ),
                'note':            r.note,
                'created_at':      r.created_at.isoformat(),
            }
            for r in records
        ]
        return Response(data)

    @action(detail=True, methods=['get'], url_path='group-history')
    def group_history(self, request, pk=None):
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

    @action(detail=True, methods=['patch'], permission_classes=[IsAdminOrRegistrar], url_path='edit-info')
    def edit_info(self, request, pk=None):
        """
        PATCH /api/clients/{id}/edit-info/
        Редактирование: ФИО, телефон, группа, is_trial.
        При снятии is_trial (False) статус меняется с 'trial' → 'new'.
        Body: { first_name?, last_name?, phone?, group_id?, is_trial? }
        """
        instance = self.get_object()
        data = request.data.copy()

        # Нормализуем group_id → group
        if 'group_id' in data:
            gid = data.pop('group_id')
            if gid:
                from apps.groups.models import Group
                try:
                    grp = Group.objects.get(id=gid)
                    if grp.status == 'completed':
                        return Response({'detail': 'Нельзя перевести в завершённый поток'}, status=status.HTTP_400_BAD_REQUEST)
                    data['group'] = gid
                    if not data.get('trainer') and grp.trainer_id:
                        data['trainer'] = str(grp.trainer_id)
                except Group.DoesNotExist:
                    return Response({'detail': 'Поток не найден'}, status=status.HTTP_404_NOT_FOUND)
            else:
                data['group'] = None

        # Обрабатываем is_trial — если снимается флаг, статус trial → new
        is_trial_raw = data.get('is_trial')
        if is_trial_raw is not None:
            # Приводим к bool (из строки 'false'/'true' или bool)
            if isinstance(is_trial_raw, str):
                is_trial_val = is_trial_raw.lower() not in ('false', '0', 'no', '')
            else:
                is_trial_val = bool(is_trial_raw)

            if not is_trial_val and instance.is_trial and instance.status == 'trial':
                # Снимаем флаг пробного — переводим статус в 'new'
                # И УДАЛЯЕМ пробный платёж — пользователь должен ввести новую оплату
                FullPayment.objects.filter(client=instance).delete()
                for ip in InstallmentPlan.objects.filter(client=instance):
                    ip.payments.all().delete()
                    ip.delete()

                old_status = instance.status
                instance.is_trial = False
                instance.status = 'new'
                instance.save(update_fields=['is_trial', 'status'])

                # Логируем смену статуса
                self.service._record_status_change(
                    instance, old_status=old_status, new_status='new',
                    user=request.user, note='Конвертация: Пробный → Новый',
                )

                data.pop('is_trial', None)
                data.pop('group', None)
                data.pop('trainer', None)

        allowed = {'first_name', 'last_name', 'phone', 'group', 'trainer', 'telegram_link'}
        filtered = {k: v for k, v in data.items() if k in allowed}

        if filtered:
            serializer = ClientUpdateSerializer(instance, data=filtered, partial=True)
            serializer.is_valid(raise_exception=True)
            try:
                instance = self.service.update_client(str(instance.id), dict(serializer.validated_data))
            except ValidationError as e:
                return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        else:
            instance.refresh_from_db()

        return Response(ClientReadSerializer(instance).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrRegistrar], url_path='enter-payment')
    def enter_payment(self, request, pk=None):
        try:
            client = self.service.enter_payment_for_client(pk, request.data, user=request.user)
        except ValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except NotFoundError as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)
        return Response(ClientReadSerializer(client).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrRegistrar], url_path='cancel-payment')
    def cancel_payment(self, request, pk=None):
        try:
            result = self.service.cancel_payment(pk, user=request.user)
        except ValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except NotFoundError as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)
        return Response(result)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrRegistrar], url_path='add-to-group')
    def add_to_group(self, request, pk=None):
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
        try:
            client = self.service.re_enroll_client(pk, request.data, user=request.user)
        except ValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except NotFoundError as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)
        return Response(ClientReadSerializer(client).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrRegistrar], url_path='refund')
    def refund(self, request, pk=None):
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
