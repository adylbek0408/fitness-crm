from decimal import Decimal, ROUND_HALF_UP

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.permissions import IsAdmin
from .serializers import (
    StatisticsFilterSerializer,
    DashboardSerializer,
    GroupRevenueSerializer,
    TrainerRevenueSerializer,
)
from .services import StatisticsService


class StatisticsViewSet(viewsets.GenericViewSet):
    service = StatisticsService()
    permission_classes = [IsAdmin]

    def _get_params(self, request) -> dict:
        serializer = StatisticsFilterSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data.copy()
        if 'group_id' in data and data['group_id'] is not None:
            data['group_id'] = str(data['group_id'])
        if 'trainer_id' in data and data['trainer_id'] is not None:
            data['trainer_id'] = str(data['trainer_id'])
        if 'registered_by_id' in data and data['registered_by_id'] is not None:
            data['registered_by_id'] = str(data['registered_by_id'])
        return data

    @action(detail=False, methods=['get'], url_path='dashboard')
    def dashboard(self, request):
        params = self._get_params(request)
        data = self.service.get_dashboard(params)
        serializer = DashboardSerializer(instance=data)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='by-group')
    def by_group(self, request):
        params = self._get_params(request)
        data = self.service.get_revenue_by_group(params)
        serializer = GroupRevenueSerializer(instance=data, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='by-trainer')
    def by_trainer(self, request):
        params = self._get_params(request)
        data = self.service.get_revenue_by_trainer(params)
        serializer = TrainerRevenueSerializer(instance=data, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='income-history')
    def income_history(self, request):
        """
        GET /api/statistics/income-history/
          ?limit=40
          ?date_from=YYYY-MM-DD
          ?date_to=YYYY-MM-DD

        Типы событий:
          income_full      (+)  полная оплата
          income_install   (+)  платёж(и) по рассрочке, сгруппированные по клиенту+дата
          bonus_out        (−)  бонус начислен
          bonus_returned   (+)  бонус возвращён компании
          refund           (−)  возврат денег клиенту
        """
        from apps.payments.models import FullPayment, InstallmentPayment, RefundLog
        from apps.clients.models import BonusTransaction
        from datetime import datetime
        from collections import defaultdict

        limit = min(int(request.query_params.get('limit', 40)), 200)

        date_from_str = request.query_params.get('date_from', '').strip()
        date_to_str   = request.query_params.get('date_to',   '').strip()

        try:
            date_from = datetime.strptime(date_from_str, '%Y-%m-%d').date() if date_from_str else None
        except ValueError:
            date_from = None
        try:
            date_to = datetime.strptime(date_to_str, '%Y-%m-%d').date() if date_to_str else None
        except ValueError:
            date_to = None

        events = []

        # ── 1. Полные оплаты ──────────────────────────────────────────────────
        fp_qs = FullPayment.objects.filter(
            is_paid=True, paid_at__isnull=False
        ).select_related('client')
        if date_from:
            fp_qs = fp_qs.filter(paid_at__date__gte=date_from)
        if date_to:
            fp_qs = fp_qs.filter(paid_at__date__lte=date_to)
        for fp in fp_qs.order_by('-paid_at')[:limit]:
            events.append({
                'type':        'income_full',
                'amount':      str(fp.amount),
                'client_name': fp.client.full_name,
                'client_id':   str(fp.client.id),
                'description': 'Полная оплата',
                'date':        fp.paid_at.isoformat(),
                'sub_items':   [],
            })

        # ── 2. Платежи по рассрочке (сортировка по created_at, группировка) ──
        # paid_at — DateField (без времени), поэтому для сортировки используем
        # created_at, который содержит точное время добавления платежа.
        ip_qs = InstallmentPayment.objects.select_related('plan__client')
        if date_from:
            ip_qs = ip_qs.filter(paid_at__gte=date_from)
        if date_to:
            ip_qs = ip_qs.filter(paid_at__lte=date_to)

        # Группируем по (client_id, paid_at) — все платежи одного клиента
        # за одну дату складываем в один блок
        group_key_to_items = defaultdict(list)
        group_key_order = []  # порядок первого появления (по created_at desc)
        for ip in ip_qs.order_by('-created_at')[:limit * 3]:
            key = (str(ip.plan.client.id), str(ip.paid_at))
            if key not in group_key_to_items:
                group_key_order.append((key, ip))
            group_key_to_items[key].append(ip)

        for key, first_ip in group_key_order:
            items = group_key_to_items[key]
            total = sum(float(p.amount) for p in items)
            # Сортируем sub_items по created_at убыв.
            items_sorted = sorted(items, key=lambda p: p.created_at, reverse=True)
            sub_items = [
                {
                    'amount': str(p.amount),
                    'date':   p.created_at.isoformat(),
                }
                for p in items_sorted
            ] if len(items) > 1 else []

            events.append({
                'type':        'income_install',
                'amount':      str(round(total, 2)),
                'client_name': first_ip.plan.client.full_name,
                'client_id':   str(first_ip.plan.client.id),
                'description': 'Платёж по рассрочке',
                # Используем created_at первого платежа для точной сортировки
                'date':        first_ip.created_at.isoformat(),
                'sub_items':   sub_items,
            })

        # ── 3. Бонусы ────────────────────────────────────────────────────────
        bt_qs = BonusTransaction.objects.select_related('client')
        if date_from:
            bt_qs = bt_qs.filter(created_at__date__gte=date_from)
        if date_to:
            bt_qs = bt_qs.filter(created_at__date__lte=date_to)
        for bt in bt_qs.order_by('-created_at')[:limit]:
            if bt.transaction_type == BonusTransaction.ACCRUAL:
                row = {
                    'type':        'bonus_out',
                    'amount':      str(bt.amount),
                    'client_name': bt.client.full_name,
                    'client_id':   str(bt.client.id),
                    'description': bt.description or 'Бонус начислен',
                    'date':        bt.created_at.isoformat(),
                    'sub_items':   [],
                }
                pa = bt.payment_amount
                if pa is not None and pa > 0:
                    row['payment_amount'] = str(pa)
                    pct = (bt.amount / pa * Decimal('100')).quantize(
                        Decimal('1'), rounding=ROUND_HALF_UP
                    )
                    row['bonus_percent'] = int(pct)
                events.append(row)
            elif bt.transaction_type == BonusTransaction.REDEMPTION:
                desc_bt = bt.description or ''
                if 'Возврат средств' in desc_bt or 'Аннулирование бонусов' in desc_bt:
                    events.append({
                        'type':        'bonus_returned',
                        'amount':      str(bt.amount),
                        'client_name': bt.client.full_name,
                        'client_id':   str(bt.client.id),
                        'description': (
                            'Аннулирование бонусов при возврате'
                            if 'Аннулирование бонусов' in desc_bt
                            else 'Бонус возвращён компании'
                        ),
                        'date':        bt.created_at.isoformat(),
                        'sub_items':   [],
                    })

        # ── 4. Возвраты ───────────────────────────────────────────────────────
        ref_qs = RefundLog.objects.all()
        if date_from:
            ref_qs = ref_qs.filter(created_at__date__gte=date_from)
        if date_to:
            ref_qs = ref_qs.filter(created_at__date__lte=date_to)
        for ref in ref_qs.order_by('-created_at')[:limit]:
            pay_label = 'Полная оплата' if ref.payment_type == 'full' else 'Рассрочка'
            sub_items = []
            try:
                ret = ref.retention_amount
                tot = ref.total_paid
                d = ref.created_at.isoformat()
                if ret is not None and float(ret) > 0:
                    sub_items.append({
                        'label': 'Удержание',
                        'amount': str(ret),
                        'date': d,
                    })
                if tot is not None and float(tot) > 0:
                    sub_items.append({
                        'label': 'Оплачено до возврата',
                        'amount': str(tot),
                        'date': d,
                    })
            except (TypeError, ValueError):
                pass
            events.append({
                'type':        'refund',
                'amount':      str(ref.amount),
                'client_name': ref.client_name,
                'client_id':   ref.client_id,
                'description': f'Возврат клиенту ({pay_label})',
                'date':        ref.created_at.isoformat(),
                'sub_items':   sub_items,
            })

        events.sort(key=lambda x: x['date'], reverse=True)
        return Response(events[:limit])

    # ── Trash API ─────────────────────────────────────────────────────────────
    @action(detail=False, methods=['get'], url_path='trash-data')
    def trash_data(self, request):
        """
        GET /api/statistics/trash-data/
        Удалённые в корзине: клиенты, группы, менеджеры (soft delete).
        """
        from apps.clients.models import Client
        from apps.groups.models import Group
        from apps.accounts.models import ManagerProfile

        clients = Client.objects.filter(deleted_at__isnull=False).select_related('group', 'trainer').order_by('-deleted_at')[:200]
        groups = Group.objects.filter(deleted_at__isnull=False).select_related('trainer').order_by('-deleted_at')[:200]
        managers = ManagerProfile.objects.filter(deleted_at__isnull=False).select_related('user').order_by('-deleted_at')

        return Response({
            'clients': [
                {
                    'id':     str(c.id),
                    'name':   c.full_name,
                    'phone':  c.phone,
                    'status': c.status,
                    'group':  f'Группа {c.group.number}' if c.group else None,
                }
                for c in clients
            ],
            'groups': [
                {
                    'id':      str(g.id),
                    'number':  g.number,
                    'type':    g.group_type,
                    'trainer': g.trainer.full_name if g.trainer else '—',
                    'status':  g.status,
                    'clients': g.clients.filter(deleted_at__isnull=True).count(),
                }
                for g in groups
            ],
            'managers': [
                {
                    'id':       str(m.id),
                    'username': m.user.username,
                    'name':     f"{m.last_name} {m.first_name}".strip() or m.user.username,
                    'active':   m.user.is_active,
                }
                for m in managers
            ],
        })

    @action(detail=False, methods=['post'], url_path='trash-delete')
    def trash_delete(self, request):
        """
        POST /api/statistics/trash-delete/
        Body: { "entity": "client"|"group"|"manager", "id": "uuid" }
        Окончательное удаление записи из корзины.
        """
        from apps.clients.models import Client
        from apps.groups.models import Group
        from apps.accounts.models import ManagerProfile

        entity = request.data.get('entity')
        obj_id = request.data.get('id')

        if not entity or not obj_id:
            return Response({'detail': 'entity и id обязательны'}, status=400)

        try:
            if entity == 'client':
                obj = Client.objects.get(id=obj_id, deleted_at__isnull=False)
                name = obj.full_name
                obj.delete()
            elif entity == 'group':
                obj = Group.objects.get(id=obj_id, deleted_at__isnull=False)
                name = f'Группа {obj.number}'
                obj.delete()
            elif entity == 'manager':
                obj = ManagerProfile.objects.select_related('user').get(id=obj_id, deleted_at__isnull=False)
                name = obj.user.username
                obj.user.delete()
            else:
                return Response({'detail': f'Неизвестный тип: {entity}'}, status=400)
        except (Client.DoesNotExist, Group.DoesNotExist, ManagerProfile.DoesNotExist):
            return Response({'detail': 'Объект не найден в корзине'}, status=404)

        return Response({'detail': f'{name} удалён навсегда.'})

    @action(detail=False, methods=['post'], url_path='trash-restore')
    def trash_restore(self, request):
        """
        POST /api/statistics/trash-restore/
        Body: { "entity": "client"|"group"|"manager", "id": "uuid" }
        """
        from apps.clients.models import Client
        from apps.groups.models import Group
        from apps.accounts.models import ManagerProfile

        entity = request.data.get('entity')
        obj_id = request.data.get('id')

        if not entity or not obj_id:
            return Response({'detail': 'entity и id обязательны'}, status=400)

        try:
            if entity == 'client':
                obj = Client.objects.get(id=obj_id, deleted_at__isnull=False)
                obj.deleted_at = None
                obj.save(update_fields=['deleted_at'])
                name = obj.full_name
            elif entity == 'group':
                obj = Group.objects.get(id=obj_id, deleted_at__isnull=False)
                obj.deleted_at = None
                obj.save(update_fields=['deleted_at'])
                name = f'Группа {obj.number}'
            elif entity == 'manager':
                obj = ManagerProfile.objects.select_related('user').get(id=obj_id, deleted_at__isnull=False)
                obj.deleted_at = None
                obj.user.is_active = True
                obj.user.save(update_fields=['is_active'])
                obj.save(update_fields=['deleted_at'])
                name = obj.user.username
            else:
                return Response({'detail': f'Неизвестный тип: {entity}'}, status=400)
        except (Client.DoesNotExist, Group.DoesNotExist, ManagerProfile.DoesNotExist):
            return Response({'detail': 'Объект не найден в корзине'}, status=404)

        return Response({'detail': f'{name} восстановлен.'})
