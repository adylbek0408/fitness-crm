from decimal import Decimal

from django.utils import timezone

from core.services import BaseService
from core.exceptions import NotFoundError, ValidationError

from .models import Group


def _get_receipt_url(receipt_field):
    """Safely get the URL of a receipt ImageField."""
    try:
        if receipt_field and receipt_field.name:
            return receipt_field.url
    except Exception:
        pass
    return None


def _format_receipt_datetime(dt):
    if not dt:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return timezone.localtime(dt).strftime('%d.%m.%Y %H:%M')


class GroupService(BaseService):

    def get_group_or_raise(self, group_id: str) -> Group:
        try:
            return Group.objects.select_related('trainer').get(id=group_id)
        except Group.DoesNotExist:
            raise NotFoundError(f"Group {group_id} not found")

    def create_group(self, data: dict) -> Group:
        # Uniqueness check must ignore soft-deleted rows. Otherwise a number
        # belonging to a trashed group blocks reuse, even though the row is
        # invisible everywhere else in the app.
        if Group.objects.filter(
            number=data.get('number'), deleted_at__isnull=True,
        ).exists():
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
                if Group.objects.filter(
                    number=other_data['number'], deleted_at__isnull=True,
                ).exists():
                    raise ValidationError(f"Group number {other_data['number']} already taken")
            for field, value in other_data.items():
                setattr(group, field, value)
            if other_data:
                group.save()
            return self.close_group(group_id)

        if 'number' in data and data['number'] != group.number:
            if Group.objects.filter(
                number=data['number'], deleted_at__isnull=True,
            ).exists():
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
            receipts = []

            if p_type == 'full':
                # У повторного клиента несколько FullPayment — нужна оплата текущего заезда,
                # т.е. последняя по времени создания (как в PaymentService / ClientReadSerializer).
                fp = (
                    client.full_payments
                    .order_by('-created_at', '-updated_at', '-id')
                    .first()
                )
                if fp:
                    # Сумма курса — номинал; оплачено — факт по счёту (после бонуса)
                    nominal = fp.course_amount if fp.course_amount is not None else fp.amount
                    p_amount = nominal
                    p_paid   = fp.amount if fp.is_paid else Decimal('0')
                    p_closed = fp.is_paid
                    receipt_url = _get_receipt_url(fp.receipt)
                    receipts.append({
                        'label':    'Полная оплата',
                        'amount':   str(fp.amount),
                        'paid_at':  _format_receipt_datetime(fp.paid_at),
                        'is_paid':  fp.is_paid,
                        'url':      receipt_url,
                    })

            elif p_type == 'installment':
                ip = (
                    client.installment_plans
                    .order_by('-created_at', '-updated_at', '-id')
                    .first()
                )
                if ip:
                    p_amount = ip.total_cost
                    p_paid   = ip.total_paid
                    p_closed = ip.is_closed
                    for i, payment in enumerate(ip.payments.all()):
                        receipt_url = _get_receipt_url(payment.receipt)
                        receipts.append({
                            'label':   f'Платёж {i + 1}',
                            'amount':  str(payment.amount),
                            'paid_at': str(payment.paid_at),
                            'url':     receipt_url,
                        })

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
                receipts=receipts,
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
