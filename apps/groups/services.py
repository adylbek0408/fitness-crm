from decimal import Decimal

from core.services import BaseService
from core.exceptions import NotFoundError, ValidationError

from .models import Group


class GroupService(BaseService):

    def get_group_or_raise(self, group_id: str) -> Group:
        try:
            return Group.objects.select_related('trainer').get(id=group_id)
        except Group.DoesNotExist:
            raise NotFoundError(f"Group {group_id} not found")

    def create_group(self, data: dict) -> Group:
        if Group.objects.filter(number=data.get('number')).exists():
            raise ValidationError(f"Group with number {data['number']} already exists")
        group = Group.objects.create(**data)
        self.logger.info(f"Group created: {group.id} #{group.number}")
        return group

    def update_group(self, group_id: str, data: dict) -> Group:
        group = self.get_group_or_raise(group_id)

        # ── Если статус меняется на completed → запускаем полное закрытие ──
        if data.get('status') == 'completed':
            if group.status == 'completed':
                raise ValidationError("Group is already completed")

            # Сохраняем остальные поля (без статуса) перед закрытием
            other_data = {k: v for k, v in data.items() if k != 'status'}
            if 'number' in other_data and other_data['number'] != group.number:
                if Group.objects.filter(number=other_data['number']).exists():
                    raise ValidationError(f"Group number {other_data['number']} already taken")
            for field, value in other_data.items():
                setattr(group, field, value)
            if other_data:
                group.save()
            return self.close_group(group_id)

        if 'number' in data and data['number'] != group.number:
            if Group.objects.filter(number=data['number']).exists():
                raise ValidationError(f"Group number {data['number']} already taken")
        for field, value in data.items():
            setattr(group, field, value)
        group.save()
        return group

    def close_group(self, group_id: str) -> Group:
        from apps.clients.models import ClientGroupHistory

        group = self.get_group_or_raise(group_id)
        if group.status == 'completed':
            raise ValidationError("Group is already completed")

        clients = list(group.clients.select_related('trainer').prefetch_related(
            'full_payments', 'installment_plans', 'installment_plans__payments'
        ).all())

        for client in clients:
            p_type   = client.payment_type
            p_amount = Decimal('0')
            p_paid   = Decimal('0')
            p_closed = False

            if p_type == 'full':
                fp = client.full_payments.first()
                if fp:
                    p_amount = fp.amount
                    p_paid   = fp.amount if fp.is_paid else Decimal('0')
                    p_closed = fp.is_paid
            elif p_type == 'installment':
                ip = client.installment_plans.first()
                if ip:
                    p_amount = ip.total_cost
                    p_paid   = ip.total_paid
                    p_closed = ip.is_closed

            ClientGroupHistory.objects.create(
                client=client,
                group=group,
                group_number=group.number,
                group_type=group.group_type,
                trainer_name=group.trainer.full_name if group.trainer else '',
                start_date=group.start_date,
                payment_type=p_type,
                payment_amount=p_amount,
                payment_paid=p_paid,
                payment_is_closed=p_closed,
            )

        # Активных клиентов → completed
        group.clients.filter(status='active').update(status='completed')
        # Открепляем всех клиентов от потока
        group.clients.update(group=None)

        group.status = 'completed'
        group.save(update_fields=['status'])
        self.logger.info(f"Group {group_id} closed, {len(clients)} clients archived")
        return group

    def activate_group(self, group_id: str) -> Group:
        group = self.get_group_or_raise(group_id)
        if group.status != 'recruitment':
            raise ValidationError("Only groups in recruitment can be activated")
        group.status = 'active'
        group.save(update_fields=['status'])
        return group
