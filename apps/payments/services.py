from decimal import Decimal

from django.utils import timezone
from core.services import BaseService
from core.exceptions import NotFoundError, ValidationError

from .models import FullPayment, InstallmentPlan, InstallmentPayment


class PaymentService(BaseService):

    def _bonus_service(self):
        from apps.clients.bonus_service import BonusService
        return BonusService()

    # ── Полная оплата ─────────────────────────────────────────────

    def mark_full_payment_paid(self, client_id: str, user=None) -> FullPayment:
        payment = FullPayment.objects.select_related('client').filter(
            client_id=client_id
        ).order_by('-created_at').first()
        if not payment:
            raise NotFoundError(f"FullPayment for client {client_id} not found")
        if payment.is_paid:
            raise ValidationError("Payment is already marked as paid")

        payment.mark_as_paid()

        # ✅ Начисляем бонус сразу — полная оплата одним платежом
        self._bonus_service().accrue(
            client=payment.client,
            payment_amount=payment.amount,
            created_by=user,
        )
        return payment

    def upload_full_payment_receipt(self, client_id: str, receipt_file,
                                    amount=None, user=None) -> FullPayment:
        payment = FullPayment.objects.select_related('client').filter(
            client_id=client_id
        ).order_by('-created_at').first()
        if not payment:
            raise NotFoundError(f"FullPayment for client {client_id} not found")

        was_paid = payment.is_paid

        payment.receipt = receipt_file
        payment.is_paid = True
        payment.paid_at = timezone.now()
        update_fields = ['receipt', 'is_paid', 'paid_at']
        if amount is not None:
            payment.amount = amount
            update_fields.append('amount')
        payment.save(update_fields=update_fields)

        # ✅ Начисляем бонус только если раньше не был оплачен
        if not was_paid:
            self._bonus_service().accrue(
                client=payment.client,
                payment_amount=payment.amount,
                created_by=user,
            )
        return payment

    # ── Рассрочка ─────────────────────────────────────────────────

    def add_installment_payment(self, plan_id: str, data: dict,
                                user=None) -> InstallmentPayment:
        try:
            plan = InstallmentPlan.objects.select_related('client').get(id=plan_id)
        except InstallmentPlan.DoesNotExist:
            raise NotFoundError(f"InstallmentPlan {plan_id} not found")

        if plan.is_closed:
            raise ValidationError("Installment plan is already fully paid")

        amount = Decimal(str(data.get('amount', 0)))
        if amount <= 0:
            raise ValidationError("Payment amount must be positive")

        payment = InstallmentPayment.objects.create(
            plan=plan,
            amount=amount,
            paid_at=data['paid_at'],
            receipt=data.get('receipt'),
            note=data.get('note', '')
        )

        # ✅ Бонус при рассрочке — ТОЛЬКО когда рассрочка полностью закрыта
        plan.refresh_from_db()
        if plan.is_closed:
            self._bonus_service().accrue(
                client=plan.client,
                payment_amount=plan.total_cost,   # бонус с полной суммы курса
                description=f'Начисление 10% бонуса — рассрочка закрыта. Сумма курса: {plan.total_cost} сом',
                created_by=user,
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
            'plan': plan,
            'total_cost': plan.total_cost,
            'total_paid': plan.total_paid,
            'remaining': plan.remaining,
            'is_closed': plan.is_closed,
            'payments': list(plan.payments.all()),
        }
