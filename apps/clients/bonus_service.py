from decimal import Decimal

from django.db import transaction as db_transaction
from django.db.models import F

from core.services import BaseService
from core.exceptions import NotFoundError, ValidationError

from .models import Client, BonusTransaction

BONUS_RATE = Decimal('0.10')   # 10% с фактически оплаченной суммы


class BonusService(BaseService):

    def _get_client(self, client_id: str) -> Client:
        try:
            return Client.objects.get(pk=client_id)
        except Client.DoesNotExist:
            raise NotFoundError(f"Client {client_id} not found")

    # ─────────────────────────────────────────────────────────────
    # Начисление: вызывается автоматически при каждой оплате
    # ─────────────────────────────────────────────────────────────
    def accrue(self, client: Client, payment_amount: Decimal,
               description: str = '', created_by=None) -> Decimal:
        """
        Начисляет 10% от payment_amount на бонусный баланс клиента.
        Создаёт запись в BonusTransaction.
        Возвращает сумму начисленного бонуса.
        """
        bonus = (payment_amount * BONUS_RATE).quantize(Decimal('0.01'))
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
                    f'Начисление {int(BONUS_RATE * 100)}% с оплаты {payment_amount} сом'
                ),
                created_by=created_by,
            )

        self.logger.info(f"[Bonus] Accrued {bonus} for client={client.id}")
        return bonus

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
