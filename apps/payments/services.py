from datetime import date
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from core.services import BaseService
from core.exceptions import NotFoundError, ValidationError

from .models import FullPayment, InstallmentPlan, InstallmentPayment

# Маркер для платежей, закрытых автоматически через бонусы
_BONUS_NOTE_MARKER = '🎁 Бонусное погашение'


class PaymentService(BaseService):

    def _bonus_service(self):
        from apps.clients.bonus_service import BonusService
        return BonusService()

    # ─────────────────────────────────────────────────────────────
    # Полная оплата
    # ─────────────────────────────────────────────────────────────

    def mark_full_payment_paid(self, client_id: str, user=None) -> FullPayment:
        payment = FullPayment.objects.select_related('client').filter(
            client_id=client_id
        ).order_by('-created_at').first()
        if not payment:
            raise NotFoundError(f"FullPayment for client {client_id} not found")
        if payment.is_paid:
            raise ValidationError("Payment is already marked as paid")

        payment.mark_as_paid()
        self._apply_bonus_and_accrue_full(payment, user)
        return payment

    def upload_full_payment_receipt(self, client_id: str, receipt_file,
                                    amount=None, user=None) -> FullPayment:
        payment = FullPayment.objects.select_related('client').filter(
            client_id=client_id
        ).order_by('-created_at').first()
        if not payment:
            raise NotFoundError(f"FullPayment for client {client_id} not found")

        was_paid = payment.is_paid

        payment.receipt  = receipt_file
        payment.is_paid  = True
        payment.paid_at  = timezone.now()
        update_fields    = ['receipt', 'is_paid', 'paid_at']
        if amount is not None:
            payment.amount = amount
            update_fields.append('amount')
        payment.save(update_fields=update_fields)

        if not was_paid:
            self._apply_bonus_and_accrue_full(payment, user)

        return payment

    def _apply_bonus_and_accrue_full(self, payment: FullPayment, user=None):
        """
        При подтверждении полной оплаты:
        1) С баланса списывается бонус не больше суммы оплаты (как при повторной записи).
        2) Начисляется бонус по % клиента (5 или 10 при регистрации) с «живой» части.
        """
        client = payment.client
        client.refresh_from_db(fields=['bonus_balance', 'bonus_percent'])
        full_price = payment.amount
        if full_price <= Decimal('0'):
            return

        bonus_svc = self._bonus_service()
        available = client.bonus_balance
        bonus_applied = min(available, full_price) if available > Decimal('0') else Decimal('0')

        if bonus_applied > Decimal('0'):
            bonus_svc.apply(str(client.pk), full_price, created_by=user)
            client.refresh_from_db(fields=['bonus_balance'])

        cash_portion = full_price - bonus_applied
        try:
            pct = int(client.bonus_percent)
        except (TypeError, ValueError):
            pct = 10
        pct = max(0, min(100, pct))
        if cash_portion > Decimal('0'):
            bonus_svc.accrue(
                client=client,
                payment_amount=cash_portion,
                description=f'{pct}% бонус с оплаты {payment.amount} сом',
                created_by=user,
                source_full_payment=payment,
            )

    # ─────────────────────────────────────────────────────────────
    # Рассрочка
    # ─────────────────────────────────────────────────────────────

    def add_installment_payment(self, plan_id: str, data: dict,
                                user=None) -> InstallmentPayment:
        """
        Добавляет платёж по рассрочке.
        Если бонус покрывает остаток — автозакрытие.
        Когда рассрочка закрыта:
          1. Списывает бонус (при автозакрытии)
          2. Начисляет 10% от суммы живых денег
        """
        try:
            plan = InstallmentPlan.objects.select_related('client').get(id=plan_id)
        except InstallmentPlan.DoesNotExist:
            raise NotFoundError(f"InstallmentPlan {plan_id} not found")

        if plan.is_closed:
            raise ValidationError("Installment plan is already fully paid")

        amount = Decimal(str(data.get('amount', 0)))
        if amount <= 0:
            raise ValidationError("Payment amount must be positive")

        paid_at = data['paid_at']
        if hasattr(paid_at, 'isoformat'):
            # it's a date object
            if paid_at > date.today():
                raise ValidationError('Нельзя указывать будущую дату платежа')
        else:
            from datetime import date as _date
            parsed = _date.fromisoformat(str(paid_at))
            if parsed > _date.today():
                raise ValidationError('Нельзя указывать будущую дату платежа')

        payment = InstallmentPayment.objects.create(
            plan=plan,
            amount=amount,
            paid_at=data['paid_at'],
            receipt=data.get('receipt'),
            note=data.get('note', '')
        )

        plan.refresh_from_db()
        client = plan.client
        client.refresh_from_db(fields=['bonus_balance'])

        bonus_svc = self._bonus_service()

        # ── Автозакрытие: бонус покрывает остаток ─────────────────
        if (
            not plan.is_closed
            and client.bonus_balance > Decimal('0')
            and client.bonus_balance >= plan.remaining
        ):
            remaining = plan.remaining
            result    = bonus_svc.apply(str(client.pk), remaining, created_by=user)
            # Создаём запись о бонусном погашении
            InstallmentPayment.objects.create(
                plan=plan,
                amount=result['bonus_applied'],
                paid_at=date.today(),
                note=_BONUS_NOTE_MARKER,
            )
            plan.refresh_from_db()
            self.logger.info(
                f"[Installment] Auto-closed with bonus: plan={plan_id}, "
                f"bonus_applied={result['bonus_applied']}"
            )

        # ── Рассрочка закрыта → начисляем новый бонус ─────────────
        if plan.is_closed:
            bonus_paid = plan.payments.filter(
                note=_BONUS_NOTE_MARKER
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

            cash_paid = plan.total_paid - bonus_paid

            if cash_paid > Decimal('0'):
                client.refresh_from_db(fields=['bonus_balance', 'bonus_percent'])
                try:
                    pct = int(client.bonus_percent)
                except (TypeError, ValueError):
                    pct = 10
                pct = max(0, min(100, pct))
                bonus_svc.accrue(
                    client=client,
                    payment_amount=cash_paid,
                    description=(
                        f'{pct}% бонус — рассрочка закрыта. '
                        f'Живыми: {cash_paid} сом, бонусами: {bonus_paid} сом'
                    ),
                    created_by=user,
                    source_installment_plan=plan,
                )

        self.logger.info(
            f"Installment payment added: {payment.id}, plan: {plan_id}, amount: {amount}"
        )
        return payment

    def get_installment_plan_with_summary(self, client_id: str) -> dict:
        plan = InstallmentPlan.objects.prefetch_related('payments').filter(
            client_id=client_id
        ).order_by('-created_at').first()
        if not plan:
            raise NotFoundError(f"InstallmentPlan for client {client_id} not found")

        return {
            'plan':       plan,
            'total_cost': plan.total_cost,
            'total_paid': plan.total_paid,
            'remaining':  plan.remaining,
            'is_closed':  plan.is_closed,
            'payments':   list(plan.payments.all()),
        }
