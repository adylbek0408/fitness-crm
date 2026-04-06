from decimal import Decimal

from django.db import transaction as db_transaction
from django.db.models import F, Sum

from core.services import BaseService
from core.exceptions import NotFoundError, ValidationError

from .models import Client, BonusTransaction

# Значение по умолчанию, если у клиента не задан процент (legacy)
DEFAULT_BONUS_PERCENT = 10


class BonusService(BaseService):

    @staticmethod
    def rate_for_client(client: Client) -> Decimal:
        """Доля для расчёта бонуса: bonus_percent / 100 (0–100%)."""
        p = getattr(client, 'bonus_percent', None)
        try:
            p = int(p)
        except (TypeError, ValueError):
            p = DEFAULT_BONUS_PERCENT
        if p < 0 or p > 100:
            p = DEFAULT_BONUS_PERCENT
        return Decimal(p) / Decimal('100')

    def _get_client(self, client_id: str) -> Client:
        try:
            return Client.objects.get(pk=client_id)
        except Client.DoesNotExist:
            raise NotFoundError(f"Client {client_id} not found")

    # ─────────────────────────────────────────────────────────────
    # Начисление: вызывается автоматически при каждой оплате
    # ─────────────────────────────────────────────────────────────
    def accrue(self, client: Client, payment_amount: Decimal,
               description: str = '', created_by=None,
               source_full_payment=None, source_installment_plan=None) -> Decimal:
        """
        Начисляет бонус по проценту клиента (задан при регистрации, 0–100%) от payment_amount.
        Создаёт запись в BonusTransaction.
        Возвращает сумму начисленного бонуса.
        """
        client.refresh_from_db(fields=['bonus_percent'])
        rate = self.rate_for_client(client)
        p_raw = getattr(client, 'bonus_percent', DEFAULT_BONUS_PERCENT)
        try:
            pct = int(p_raw)
        except (TypeError, ValueError):
            pct = DEFAULT_BONUS_PERCENT
        pct = max(0, min(100, pct))
        bonus = (payment_amount * rate).quantize(Decimal('0.01'))
        if bonus <= 0:
            return bonus

        with db_transaction.atomic():
            Client.objects.filter(pk=client.pk).update(
                bonus_balance=F('bonus_balance') + bonus
            )
            BonusTransaction.objects.create(
                client=client,
                transaction_type=BonusTransaction.ACCRUAL,
                amount=bonus,
                payment_amount=payment_amount,
                description=description or (
                    f'Начисление {pct}% с оплаты {payment_amount} сом'
                ),
                created_by=created_by,
                source_full_payment=source_full_payment,
                source_installment_plan=source_installment_plan,
            )

        self.logger.info(f"[Bonus] Accrued {bonus} for client={client.id}")
        return bonus

    def void_accruals_for_refund(
        self,
        client: Client,
        *,
        full_payment=None,
        installment_plan=None,
        user=None,
    ) -> Decimal:
        """
        Полностью аннулирует бонусы, начисленные с указанной оплаты/рассрочки.
        Списывает сумму начислений с bonus_balance (баланс может уйти в минус).
        Создаёт одну операцию REDEMPTION на общую сумму аннулирования.
        """
        from apps.payments.models import FullPayment, InstallmentPlan

        qs = BonusTransaction.objects.filter(
            client=client,
            transaction_type=BonusTransaction.ACCRUAL,
        )
        total = Decimal('0')

        if full_payment is not None:
            if not isinstance(full_payment, FullPayment):
                raise ValidationError('full_payment должен быть FullPayment')
            linked = qs.filter(source_full_payment=full_payment)
            agg = linked.aggregate(s=Sum('amount'))['s']
            total = (agg or Decimal('0')).quantize(Decimal('0.01'))
            if total == Decimal('0') and full_payment.is_paid:
                legacy = qs.filter(
                    source_full_payment__isnull=True,
                    source_installment_plan__isnull=True,
                    payment_amount=full_payment.amount,
                )
                agg2 = legacy.aggregate(s=Sum('amount'))['s']
                total = (agg2 or Decimal('0')).quantize(Decimal('0.01'))

        elif installment_plan is not None:
            if not isinstance(installment_plan, InstallmentPlan):
                raise ValidationError('installment_plan должен быть InstallmentPlan')
            linked = qs.filter(source_installment_plan=installment_plan)
            agg = linked.aggregate(s=Sum('amount'))['s']
            total = (agg or Decimal('0')).quantize(Decimal('0.01'))
        else:
            return Decimal('0')

        if total <= Decimal('0'):
            return Decimal('0')

        with db_transaction.atomic():
            Client.objects.filter(pk=client.pk).update(
                bonus_balance=F('bonus_balance') - total
            )
            BonusTransaction.objects.create(
                client=client,
                transaction_type=BonusTransaction.REDEMPTION,
                amount=total,
                description=(
                    'Аннулирование бонусов при возврате оплаты '
                    f'(начислено с этой оплаты: {total} сом)'
                ),
                created_by=user,
            )

        self.logger.info(
            f"[Bonus] Voided accruals {total} for client={client.id} (refund)"
        )
        return total

    # ─────────────────────────────────────────────────────────────
    # Предпросмотр: показать сколько спишется без реального списания
    # ─────────────────────────────────────────────────────────────
    def preview(self, client_id: str, full_price: Decimal) -> dict:
        """
        Возвращает словарь:
          full_price      — полная цена курса
          bonus_available — бонусов на балансе
          bonus_applied   — сколько спишется (не больше full_price)
          final_price     — итого к оплате
        Не меняет данные в БД.
        """
        client = self._get_client(client_id)
        client.refresh_from_db(fields=['bonus_balance'])
        available = client.bonus_balance
        applied   = min(available, full_price)
        return {
            'full_price':       full_price,
            'bonus_available':  available,
            'bonus_applied':    applied,
            'final_price':      full_price - applied,
        }

    # ─────────────────────────────────────────────────────────────
    # Применение: реально списать бонус
    # ─────────────────────────────────────────────────────────────
    def apply(self, client_id: str, full_price: Decimal,
              created_by=None) -> dict:
        """
        Списывает бонусы со счёта клиента (не больше full_price).
        Возвращает тот же словарь что и preview.
        """
        client = self._get_client(client_id)
        client.refresh_from_db(fields=['bonus_balance'])

        available = client.bonus_balance
        if available <= 0:
            return {
                'full_price':      full_price,
                'bonus_available': Decimal('0'),
                'bonus_applied':   Decimal('0'),
                'final_price':     full_price,
            }

        to_deduct = min(available, full_price)

        with db_transaction.atomic():
            Client.objects.filter(pk=client.pk).update(
                bonus_balance=F('bonus_balance') - to_deduct
            )
            BonusTransaction.objects.create(
                client=client,
                transaction_type=BonusTransaction.REDEMPTION,
                amount=to_deduct,
                payment_amount=full_price,
                description=(
                    f'Списание бонусов при повторной записи. '
                    f'Полная цена курса: {full_price} сом'
                ),
                created_by=created_by,
            )

        self.logger.info(
            f"[Bonus] Applied {to_deduct} for client={client.id}, "
            f"full_price={full_price}, final={full_price - to_deduct}"
        )
        return {
            'full_price':      full_price,
            'bonus_available': available,
            'bonus_applied':   to_deduct,
            'final_price':     full_price - to_deduct,
        }

    # ─────────────────────────────────────────────────────────────
    # История операций клиента
    # ─────────────────────────────────────────────────────────────
    def get_history(self, client_id: str) -> list:
        self._get_client(client_id)   # проверяем существование
        return list(
            BonusTransaction.objects
            .filter(client_id=client_id)
            .select_related('created_by')
        )
