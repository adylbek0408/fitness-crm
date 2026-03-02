from decimal import Decimal

from core.services import BaseService
from core.exceptions import NotFoundError, ValidationError

from .models import FullPayment, InstallmentPlan, InstallmentPayment


class PaymentService(BaseService):

    def mark_full_payment_paid(self, client_id: str) -> FullPayment:
        try:
            payment = FullPayment.objects.get(client_id=client_id)
        except FullPayment.DoesNotExist:
            raise NotFoundError(f"FullPayment for client {client_id} not found")
        if payment.is_paid:
            raise ValidationError("Payment is already marked as paid")
        payment.mark_as_paid()
        return payment

    def upload_full_payment_receipt(self, client_id: str, receipt_file) -> FullPayment:
        try:
            payment = FullPayment.objects.get(client_id=client_id)
        except FullPayment.DoesNotExist:
            raise NotFoundError(f"FullPayment for client {client_id} not found")
        payment.receipt = receipt_file
        payment.save(update_fields=['receipt'])
        return payment

    def add_installment_payment(self, plan_id: str, data: dict) -> InstallmentPayment:
        try:
            plan = InstallmentPlan.objects.get(id=plan_id)
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
        self.logger.info(
            f"Installment payment added: {payment.id}, plan: {plan_id}, amount: {amount}"
        )
        return payment

    def get_installment_plan_with_summary(self, client_id: str) -> dict:
        try:
            plan = InstallmentPlan.objects.prefetch_related('payments').get(
                client_id=client_id
            )
        except InstallmentPlan.DoesNotExist:
            raise NotFoundError(f"InstallmentPlan for client {client_id} not found")

        return {
            'plan': plan,
            'total_cost': plan.total_cost,
            'total_paid': plan.total_paid,
            'remaining': plan.remaining,
            'is_closed': plan.is_closed,
            'payments': list(plan.payments.all()),
        }
