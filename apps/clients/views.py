from decimal import Decimal, InvalidOperation

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db import transaction
from django.db.models import Prefetch, Count, Sum
from django.utils import timezone

from core.permissions import IsAdmin, IsAdminOrRegistrar
from core.exceptions import ValidationError, NotFoundError
from .models import Client, ClientGroupHistory, ClientStatusHistory, ClientEnrollment, EnrollmentPayment
from .serializers import (
    ClientReadSerializer, ClientCreateSerializer, ClientUpdateSerializer,
    ClientEnrollmentReadSerializer, EnrollmentCreateSerializer, EnrollmentAddPaymentSerializer,
)
from .services import ClientService
from .filters import ClientFilter
from apps.payments.models import FullPayment, InstallmentPlan


class ClientViewSet(viewsets.ModelViewSet):
    service = ClientService()
    filterset_class = ClientFilter
    search_fields = ['first_name', 'last_name', 'phone']
    ordering_fields = ['registered_at', 'last_name', 'status']

    def get_queryset(self):
        from .models import ClientEnrollment
        qs = Client.objects.filter(deleted_at__isnull=True).select_related(
            'group', 'group__trainer', 'trainer', 'registered_by', 'cabinet_account'
        ).prefetch_related(
            Prefetch('full_payments', queryset=FullPayment.objects.order_by('-created_at')),
            Prefetch('installment_plans', queryset=InstallmentPlan.objects.order_by('-created_at').prefetch_related('payments')),
            Prefetch(
                'parallel_enrollments',
                queryset=ClientEnrollment.objects.filter(is_active=True)
                    .select_related('group', 'group__trainer')
                    .prefetch_related('payments'),
            ),
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
        # Используем get_queryset() чтобы применить ролевую фильтрацию (менеджер видит только своих)
        simple_qs = self.get_queryset()
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
            'expelled': 'Отчислен', 'frozen': 'Заморозка', 'active_frozen': 'Активный+Заморозка',
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

        # Нормализуем second_group_id → second_group
        if 'second_group_id' in data:
            sgid = data.pop('second_group_id')
            if sgid:
                from apps.groups.models import Group as GroupModel
                try:
                    GroupModel.objects.get(id=sgid)
                    data['second_group'] = sgid
                except GroupModel.DoesNotExist:
                    return Response({'detail': 'Вторая группа не найдена'}, status=status.HTTP_404_NOT_FOUND)
            else:
                data['second_group'] = None

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
                from django.db import transaction as _tx
                with _tx.atomic():
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

        # Handle google_email separately (stored on ClientAccount, not Client)
        if 'google_email' in data:
            new_google_email = (data.pop('google_email') or '').strip().lower()
            try:
                acct = instance.cabinet_account
                old_google_email = acct.google_email or ''
                if old_google_email and old_google_email != new_google_email:
                    # Email changed — clear cached google_id so next Google login re-links
                    acct.google_id = ''
                acct.google_email = new_google_email
                acct.save(update_fields=['google_email', 'google_id'])
            except Exception:
                pass

        allowed = {'first_name', 'last_name', 'phone', 'group', 'second_group', 'trainer', 'telegram_link', 'notes', 'training_format', 'group_type'}
        filtered = {k: v for k, v in data.items() if k in allowed}

        # Detect training_format change for audit log
        old_training_format = instance.training_format
        new_training_format = filtered.get('training_format')

        if filtered:
            serializer = ClientUpdateSerializer(instance, data=filtered, partial=True)
            serializer.is_valid(raise_exception=True)
            try:
                instance = self.service.update_client(str(instance.id), dict(serializer.validated_data))
            except ValidationError as e:
                return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

            if new_training_format and new_training_format != old_training_format:
                FORMAT_LABEL = {'online': 'Онлайн', 'offline': 'Оффлайн'}
                from .models import ClientStatusHistory
                ClientStatusHistory.objects.create(
                    client=instance,
                    old_status=old_training_format,
                    new_status=new_training_format,
                    changed_by=request.user,
                    changed_by_name=self.service._get_user_snap(request.user),
                    note=f'Смена формата: {FORMAT_LABEL.get(old_training_format, old_training_format)} → {FORMAT_LABEL.get(new_training_format, new_training_format)}',
                )
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

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrRegistrar], url_path='reserve-group')
    def reserve_group(self, request, pk=None):
        try:
            self.service.create_reservation(pk, request.data, user=request.user)
        except ValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except NotFoundError as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)
        client = self.service.get_client_or_raise(pk)
        return Response(ClientReadSerializer(client).data)

    @action(detail=True, methods=['delete'], permission_classes=[IsAdminOrRegistrar], url_path='cancel-reservation')
    def cancel_reservation(self, request, pk=None):
        try:
            self.service.cancel_reservation(pk, user=request.user)
        except ValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except NotFoundError as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)
        client = self.service.get_client_or_raise(pk)
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

    # ── Параллельные записи (enrollment) ───────────────────────────────────────

    @action(detail=True, methods=['get'], permission_classes=[IsAdminOrRegistrar], url_path='enrollments')
    def list_enrollments(self, request, pk=None):
        """Список активных параллельных записей клиента."""
        try:
            client = self.service.get_client_or_raise(pk)
        except NotFoundError as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)
        enrollments = (
            ClientEnrollment.objects
            .filter(client=client, is_active=True)
            .prefetch_related('payments')
            .select_related('group', 'group__trainer')
            .order_by('created_at')
        )
        return Response(ClientEnrollmentReadSerializer(enrollments, many=True).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrRegistrar], url_path='enrollments/create')
    @transaction.atomic
    def create_enrollment(self, request, pk=None):
        """Добавить клиента в параллельную группу."""
        try:
            client = self.service.get_client_or_raise(pk)
        except NotFoundError as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)

        ser = EnrollmentCreateSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        from apps.groups.models import Group
        data = ser.validated_data
        try:
            group = Group.objects.get(id=data['group_id'], deleted_at__isnull=True)
        except Group.DoesNotExist:
            return Response({'detail': 'Группа не найдена.'}, status=status.HTTP_404_NOT_FOUND)

        if group.status == 'completed':
            return Response({'detail': 'Нельзя записать в завершённую группу.'}, status=status.HTTP_400_BAD_REQUEST)

        if ClientEnrollment.objects.filter(client=client, group=group, is_active=True).exists():
            return Response({'detail': 'Клиент уже записан в эту группу.'}, status=status.HTTP_400_BAD_REQUEST)

        snap = f"{request.user.last_name} {request.user.first_name}".strip() or request.user.username
        try:
            enrollment = ClientEnrollment.objects.create(
                client=client,
                group=group,
                payment_type=data['payment_type'],
                payment_amount=data.get('payment_amount'),
                total_cost=data.get('total_cost'),
                deadline=data.get('deadline'),
                bonus_percent=data['bonus_percent'],
                note=data.get('note', ''),
                enrolled_by=request.user,
                enrolled_by_name=snap,
            )
            client.second_group_id = group.pk
            client.save(update_fields=['second_group_id'])
        except Exception as e:
            import traceback, logging
            logging.getLogger(__name__).error('create_enrollment error: %s\n%s', e, traceback.format_exc())
            transaction.set_rollback(True)
            return Response({'detail': f'Ошибка записи: {e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            data_out = ClientEnrollmentReadSerializer(enrollment).data
        except Exception:
            data_out = {'id': str(enrollment.id), 'group': str(group.pk)}

        return Response(data_out, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrRegistrar],
            url_path=r'enrollments/(?P<enrollment_id>[0-9a-f-]+)/payment')
    def add_enrollment_payment(self, request, pk=None, enrollment_id=None):
        """Добавить платёж к параллельной записи."""
        import traceback as _tb, logging as _log
        _logger = _log.getLogger(__name__)

        try:
            client = self.service.get_client_or_raise(pk)
        except NotFoundError as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)

        try:
            enrollment = ClientEnrollment.objects.get(id=enrollment_id, client=client, is_active=True)
        except ClientEnrollment.DoesNotExist:
            return Response({'detail': 'Запись не найдена.'}, status=status.HTTP_404_NOT_FOUND)

        ser = EnrollmentAddPaymentSerializer(data=request.data)
        if not ser.is_valid():
            first_error = next(iter(ser.errors.values()), ['Ошибка валидации'])[0]
            return Response({'detail': str(first_error)}, status=status.HTTP_400_BAD_REQUEST)

        data = ser.validated_data
        snap = f"{request.user.last_name} {request.user.first_name}".strip() or request.user.username
        from datetime import date as _date
        paid_at = data.get('paid_at') or _date.today()
        try:
            EnrollmentPayment.objects.create(
                enrollment=enrollment,
                amount=data['amount'],
                paid_at=paid_at,
                receipt=data.get('receipt'),
                note=data.get('note', ''),
                created_by=request.user,
                created_by_name=snap,
            )
        except Exception as e:
            _logger.error('EnrollmentPayment.create failed: %s\n%s', e, _tb.format_exc())
            return Response(
                {'detail': f'Ошибка сохранения платежа: {e}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        enrollment.refresh_from_db()
        try:
            data_out = ClientEnrollmentReadSerializer(enrollment).data
        except Exception as e:
            _logger.error('EnrollmentReadSerializer failed after payment: %s', e)
            try:
                g = enrollment.group
                data_out = {
                    'id': str(enrollment.id),
                    'group': str(enrollment.group_id),
                    'group_number': g.number if g else '',
                    'group_type': getattr(g, 'group_type', ''),
                    'group_training_format': getattr(g, 'training_format', 'offline'),
                    'group_status': getattr(g, 'status', ''),
                    'trainer_name': '',
                    'payment_type': enrollment.payment_type,
                    'payment_amount': str(enrollment.payment_amount or '0'),
                    'total_cost': str(enrollment.total_cost or '0'),
                    'deadline': str(enrollment.deadline) if enrollment.deadline else None,
                    'bonus_percent': enrollment.bonus_percent,
                    'is_active': enrollment.is_active,
                    'note': enrollment.note,
                    'amount_paid': str(sum(p.amount for p in enrollment.payments.all())),
                    'is_fully_paid': False,
                    'payments': [],
                    'enrolled_by_name': enrollment.enrolled_by_name,
                    'created_at': enrollment.created_at.isoformat(),
                }
            except Exception:
                data_out = {'id': str(enrollment.id), 'detail': 'ok'}
        return Response(data_out)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrRegistrar],
            url_path=r'enrollments/(?P<enrollment_id>[0-9a-f-]+)/cancel-payment')
    def cancel_enrollment_payment(self, request, pk=None, enrollment_id=None):
        """Удалить все платежи по параллельной записи (сброс оплаты до нуля)."""
        try:
            client = self.service.get_client_or_raise(pk)
        except NotFoundError as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)
        try:
            enrollment = ClientEnrollment.objects.get(id=enrollment_id, client=client, is_active=True)
        except ClientEnrollment.DoesNotExist:
            return Response({'detail': 'Запись не найдена.'}, status=status.HTTP_404_NOT_FOUND)

        enrollment.payments.all().delete()
        enrollment.payment_amount = None
        enrollment.total_cost = None
        enrollment.deadline = None
        enrollment.save(update_fields=['payment_amount', 'total_cost', 'deadline'])
        enrollment.refresh_from_db()
        try:
            data_out = ClientEnrollmentReadSerializer(enrollment).data
        except Exception:
            data_out = {'id': str(enrollment.id), 'amount_paid': '0', 'payments': [],
                        'payment_amount': None, 'total_cost': None, 'deadline': None}
        return Response(data_out)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrRegistrar],
            url_path=r'enrollments/(?P<enrollment_id>[0-9a-f-]+)/configure')
    def configure_enrollment_payment(self, request, pk=None, enrollment_id=None):
        """Установить/изменить тип и сумму оплаты для параллельной записи."""
        from decimal import Decimal as _D, InvalidOperation
        try:
            client = self.service.get_client_or_raise(pk)
        except NotFoundError as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)
        try:
            enrollment = ClientEnrollment.objects.get(id=enrollment_id, client=client, is_active=True)
        except ClientEnrollment.DoesNotExist:
            return Response({'detail': 'Запись не найдена.'}, status=status.HTTP_404_NOT_FOUND)

        payment_type = request.data.get('payment_type')
        if payment_type not in ('full', 'installment'):
            return Response({'detail': 'payment_type должен быть full или installment.'}, status=400)

        if payment_type == 'full':
            try:
                amount = _D(str(request.data.get('payment_amount', 0)))
                if amount <= 0:
                    raise ValueError
            except (InvalidOperation, ValueError):
                return Response({'detail': 'Укажите корректную сумму.'}, status=400)
            enrollment.payment_type = 'full'
            enrollment.payment_amount = amount
            enrollment.total_cost = None
            enrollment.deadline = None
            enrollment.save(update_fields=['payment_type', 'payment_amount', 'total_cost', 'deadline'])
        else:
            try:
                total = _D(str(request.data.get('total_cost', 0)))
                if total <= 0:
                    raise ValueError
            except (InvalidOperation, ValueError):
                return Response({'detail': 'Укажите корректную стоимость.'}, status=400)
            deadline = request.data.get('deadline')
            if not deadline:
                return Response({'detail': 'Укажите дедлайн.'}, status=400)
            enrollment.payment_type = 'installment'
            enrollment.total_cost = total
            enrollment.deadline = deadline
            enrollment.payment_amount = None
            enrollment.save(update_fields=['payment_type', 'payment_amount', 'total_cost', 'deadline'])

        enrollment.refresh_from_db()
        try:
            data_out = ClientEnrollmentReadSerializer(enrollment).data
        except Exception:
            data_out = {'id': str(enrollment.id), 'detail': 'ok'}
        return Response(data_out)

    @action(detail=True, methods=['delete'], permission_classes=[IsAdminOrRegistrar],
            url_path=r'enrollments/(?P<enrollment_id>[0-9a-f-]+)/remove')
    def remove_enrollment(self, request, pk=None, enrollment_id=None):
        """Деактивировать параллельную запись."""
        try:
            client = self.service.get_client_or_raise(pk)
        except NotFoundError as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)

        try:
            enrollment = ClientEnrollment.objects.get(id=enrollment_id, client=client, is_active=True)
        except ClientEnrollment.DoesNotExist:
            return Response({'detail': 'Запись не найдена.'}, status=status.HTTP_404_NOT_FOUND)

        enrollment.is_active = False
        enrollment.save(update_fields=['is_active'])
        if client.second_group_id == enrollment.group_id:
            client.second_group_id = None
            client.save(update_fields=['second_group_id'])

        return Response({'detail': 'Запись деактивирована.'})

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrRegistrar],
            url_path=r'enrollments/(?P<enrollment_id>[0-9a-f-]+)/freeze')
    def freeze_enrollment(self, request, pk=None, enrollment_id=None):
        """Заморозить параллельную запись: удержать сумму, вернуть остаток, сменить статус."""
        from apps.payments.models import RefundLog
        try:
            client = self.service.get_client_or_raise(pk)
        except NotFoundError as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)

        try:
            enrollment = ClientEnrollment.objects.get(id=enrollment_id, client=client, is_active=True)
        except ClientEnrollment.DoesNotExist:
            return Response({'detail': 'Запись не найдена.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            from decimal import Decimal as _D, InvalidOperation as _Inv
            raw = request.data.get('retention_amount', '0') or '0'
            retention_amount = _D(str(raw).replace(',', '.'))
        except (_Inv, ValueError):
            return Response({'detail': 'Некорректная сумма удержания.'}, status=status.HTTP_400_BAD_REQUEST)

        if retention_amount < _D('0'):
            return Response({'detail': 'Удержание не может быть отрицательным.'}, status=status.HTTP_400_BAD_REQUEST)

        total_paid = enrollment.payments.aggregate(s=Sum('amount'))['s'] or _D('0')

        if retention_amount > total_paid:
            return Response(
                {'detail': f'Удержание ({retention_amount} сом) превышает оплаченную сумму ({total_paid} сом).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        refund_to_client = total_paid - retention_amount
        group_number = enrollment.group.number if enrollment.group_id else '?'

        # Remove all enrollment payments
        enrollment.payments.all().delete()

        # Mark as frozen (visible in history, hidden from active blocks); is_active stays True
        from django.utils.timezone import now as _now
        enrollment.frozen = True
        enrollment.frozen_at = _now().date()
        enrollment.save(update_fields=['frozen', 'frozen_at'])
        if client.second_group_id and str(client.second_group_id) == str(enrollment.group_id):
            client.second_group_id = None
            client.save(update_fields=['second_group_id'])

        # Determine client status: primary group still active → active_frozen, else frozen
        old_status = client.status
        new_status = 'active_frozen' if client.group_id else 'frozen'
        client.status = new_status
        client.save(update_fields=['status'])
        self.service._record_status_change(
            client, old_status, new_status, user=request.user,
            note=f'Заморозка доп. группы #{group_number}',
        )

        note = (
            f'Заморозка доп. группы #{group_number}. '
            f'Оплачено: {total_paid} сом; удержание: {retention_amount} сом; '
            f'к возврату: {refund_to_client} сом.'
        )
        RefundLog.objects.create(
            client_name=client.full_name,
            client_id=str(client.id),
            amount=refund_to_client,
            retention_amount=retention_amount,
            total_paid=total_paid,
            payment_type='enrollment',
            note=note,
            created_by=request.user,
        )

        STATUS_LABEL = {'active_frozen': 'Акт.+Заморозка', 'frozen': 'Заморозка'}
        detail = (
            f'Доп. группа #{group_number} заморожена.'
            + (f' К возврату клиенту: {refund_to_client} сом.' if refund_to_client > 0 else '')
            + (f' Удержано: {retention_amount} сом.' if retention_amount > 0 else '')
            + f' Статус клиента → «{STATUS_LABEL.get(new_status, new_status)}».'
        )

        return Response({
            'detail': detail,
            'refund_to_client': str(refund_to_client),
            'retention_amount': str(retention_amount),
            'total_paid': str(total_paid),
            'new_status': new_status,
            'client': ClientReadSerializer(client).data,
        })

    @action(detail=True, methods=['patch'], permission_classes=[IsAdminOrRegistrar],
            url_path=r'enrollments/(?P<enrollment_id>[0-9a-f-]+)/change-group')
    def change_enrollment_group(self, request, pk=None, enrollment_id=None):
        """Изменить группу в параллельной записи. Опционально добавляет платёж (Доплата)."""
        try:
            client = self.service.get_client_or_raise(pk)
        except NotFoundError as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)

        try:
            enrollment = ClientEnrollment.objects.get(id=enrollment_id, client=client, is_active=True)
        except ClientEnrollment.DoesNotExist:
            return Response({'detail': 'Запись не найдена.'}, status=status.HTTP_404_NOT_FOUND)

        group_id = request.data.get('group_id')
        if not group_id:
            return Response({'detail': 'group_id обязателен.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.groups.models import Group
        try:
            new_group = Group.objects.get(id=group_id, deleted_at__isnull=True)
        except Group.DoesNotExist:
            return Response({'detail': 'Группа не найдена.'}, status=status.HTTP_404_NOT_FOUND)

        if new_group.status == 'completed':
            return Response({'detail': 'Нельзя перевести в завершённую группу.'}, status=status.HTTP_400_BAD_REQUEST)

        if str(enrollment.group_id) == str(new_group.id):
            return Response({'detail': 'Клиент уже в этой группе.'}, status=status.HTTP_400_BAD_REQUEST)

        old_group_id = enrollment.group_id

        with transaction.atomic():
            enrollment.group = new_group
            enrollment.save(update_fields=['group'])

            if client.second_group_id and str(client.second_group_id) == str(old_group_id):
                client.second_group = new_group
                client.save(update_fields=['second_group'])

            payment_amount_raw = request.data.get('payment_amount')
            if payment_amount_raw:
                from decimal import Decimal as _D, InvalidOperation as _Inv
                try:
                    amount = _D(str(payment_amount_raw).replace(',', '.'))
                    if amount > 0:
                        snap = f"{request.user.last_name} {request.user.first_name}".strip() or request.user.username
                        from datetime import date as _date
                        EnrollmentPayment.objects.create(
                            enrollment=enrollment,
                            amount=amount,
                            paid_at=_date.today(),
                            note='Доплата при смене группы',
                            created_by=request.user,
                            created_by_name=snap,
                        )
                except (_Inv, ValueError):
                    return Response({'detail': 'Некорректная сумма доплаты.'}, status=status.HTTP_400_BAD_REQUEST)

        enrollment.refresh_from_db()
        try:
            data_out = ClientEnrollmentReadSerializer(enrollment).data
        except Exception:
            data_out = {'id': str(enrollment.id), 'detail': 'ok'}
        return Response(data_out)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrRegistrar], url_path='leave-group')
    def leave_group(self, request, pk=None):
        """Убрать клиента из основной группы без возврата денег."""
        try:
            client = self.service.get_client_or_raise(pk)
        except NotFoundError as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)

        if not client.group_id:
            return Response({'detail': 'Клиент не состоит в группе.'}, status=status.HTTP_400_BAD_REQUEST)

        client.group_id = None
        client.group_type = ''
        client.save(update_fields=['group_id', 'group_type'])

        client.refresh_from_db()
        return Response(ClientReadSerializer(client).data)
