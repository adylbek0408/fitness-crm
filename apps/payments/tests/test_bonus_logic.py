"""
Тесты для PaymentService — бонусная логика.

Правила (финальные):
  1. Первый клиент — бонус начисляется только после подтверждения оплаты.
  2. Повторная запись (re_enroll):
       - Бонус СПИСЫВАЕТСЯ при записи (если есть).
       - FullPayment создаётся на сумму ПОСЛЕ вычета бонуса.
       - При подтверждении оплаты начисляется новый 10% бонус.
  3. Рассрочка: бонус на общую стоимость тоже применяется при записи.
     Когда рассрочка закрыта → начисляется 10% от суммы живых денег.
"""

import pytest
from decimal import Decimal
from datetime import date

from core.exceptions import ValidationError

from apps.clients.models import Client, BonusTransaction
from apps.clients.services import ClientService
from apps.payments.models import FullPayment, InstallmentPlan, InstallmentPayment
from apps.payments.services import PaymentService
from apps.groups.models import Group
from apps.trainers.models import Trainer


# ─────────────────────────────────────────────
# Фабрики
# ─────────────────────────────────────────────

def make_client(phone='001', bonus_balance=Decimal('0'), status='completed', payment_type='full'):
    return Client.objects.create(
        first_name='Тест', last_name='Клиент',
        phone=f'+7000{phone}',
        training_format='offline', group_type='1.5h',
        payment_type=payment_type,
        status=status,
        bonus_balance=bonus_balance,
    )


def make_group(number=1, status='active'):
    trainer = Trainer.objects.create(first_name='Тр', last_name='ер')
    return Group.objects.create(
        number=number, group_type='1.5h',
        start_date=date(2025, 1, 1),
        trainer=trainer, status=status,
    )


# ─────────────────────────────────────────────
# Тесты: Полная оплата — mark_full_payment_paid
# ─────────────────────────────────────────────

@pytest.mark.django_db
class TestFullPaymentBonusLogic:

    def test_bonus_not_accrued_before_payment(self):
        """При создании оплаты бонус НЕ начисляется."""
        client = make_client(phone='101')
        FullPayment.objects.create(client=client, amount=Decimal('15000'))
        client.refresh_from_db()
        assert client.bonus_balance == Decimal('0')

    def test_bonus_accrued_on_payment_no_existing_bonus(self):
        """Нет бонуса → начисляется 10% от суммы оплаты."""
        client = make_client(phone='102')
        FullPayment.objects.create(client=client, amount=Decimal('15000'))
        PaymentService().mark_full_payment_paid(str(client.id))
        client.refresh_from_db()
        assert client.bonus_balance == Decimal('1500.00')   # 10% от 15000

    def test_existing_bonus_deducted_then_new_bonus_accrued(self):
        """
        Бонус 1500 + оплата 15000 (прямая оплата, не через re-enroll):
          - Списывается 1500
          - Начисляется 10% от 13500 = 1350
          - Итого: 1350
        """
        client = make_client(phone='103', bonus_balance=Decimal('1500'))
        FullPayment.objects.create(client=client, amount=Decimal('15000'))
        PaymentService().mark_full_payment_paid(str(client.id))
        client.refresh_from_db()
        assert client.bonus_balance == Decimal('1350.00')

    def test_bonus_larger_than_payment_amount(self):
        """
        Бонус 5000 > оплата 3000:
          - Списывается 3000 (не больше суммы)
          - final = 0 → 10% от 0 = 0
          - Итого: 5000 - 3000 = 2000
        """
        client = make_client(phone='104', bonus_balance=Decimal('5000'))
        FullPayment.objects.create(client=client, amount=Decimal('3000'))
        PaymentService().mark_full_payment_paid(str(client.id))
        client.refresh_from_db()
        assert client.bonus_balance == Decimal('2000.00')

    def test_payment_marked_as_paid(self):
        """Оплата помечается is_paid=True."""
        client = make_client(phone='105')
        FullPayment.objects.create(client=client, amount=Decimal('15000'))
        result = PaymentService().mark_full_payment_paid(str(client.id))
        assert result.is_paid is True
        assert result.paid_at is not None

    def test_double_payment_raises(self):
        """Повторное подтверждение → ошибка."""
        client = make_client(phone='106')
        payment = FullPayment.objects.create(client=client, amount=Decimal('15000'))
        payment.mark_as_paid()
        with pytest.raises(ValidationError, match='already marked as paid'):
            PaymentService().mark_full_payment_paid(str(client.id))

    def test_bonus_transactions_recorded(self):
        """В историю записываются: списание + начисление."""
        client = make_client(phone='107', bonus_balance=Decimal('1500'))
        FullPayment.objects.create(client=client, amount=Decimal('15000'))
        PaymentService().mark_full_payment_paid(str(client.id))
        types = list(BonusTransaction.objects.filter(client=client).values_list('transaction_type', flat=True))
        assert BonusTransaction.REDEMPTION in types
        assert BonusTransaction.ACCRUAL    in types


# ─────────────────────────────────────────────
# Тесты: Рассрочка — add_installment_payment
# ─────────────────────────────────────────────

@pytest.mark.django_db
class TestInstallmentBonusLogic:

    def test_partial_payment_no_bonus_accrued(self):
        """Частичный платёж — бонус НЕ начисляется."""
        client = make_client(phone='201', payment_type='installment')
        plan = InstallmentPlan.objects.create(client=client, total_cost=Decimal('15000'), deadline=date(2025, 12, 1))
        PaymentService().add_installment_payment(str(plan.id), {'amount': Decimal('5000'), 'paid_at': date(2025, 3, 1)})
        client.refresh_from_db()
        assert client.bonus_balance == Decimal('0')

    def test_final_payment_closes_plan_and_accrues_bonus(self):
        """Последний платёж закрывает рассрочку → 10% от полной суммы."""
        client = make_client(phone='202', payment_type='installment')
        plan = InstallmentPlan.objects.create(client=client, total_cost=Decimal('15000'), deadline=date(2025, 12, 1))
        svc = PaymentService()
        svc.add_installment_payment(str(plan.id), {'amount': Decimal('10000'), 'paid_at': date(2025, 3, 1)})
        client.refresh_from_db()
        assert client.bonus_balance == Decimal('0')

        svc.add_installment_payment(str(plan.id), {'amount': Decimal('5000'), 'paid_at': date(2025, 4, 1)})
        client.refresh_from_db()
        assert client.bonus_balance == Decimal('1500.00')   # 10% от 15000

    def test_autoclosure_with_bonus(self):
        """
        Бонус 2000, рассрочка 15000, заплатил 13000 живыми.
        Остаток = 2000, бонус == остатку → автозакрытие.
        Новый бонус: 10% от 13000 = 1300. Итого: 1300.
        """
        client = make_client(phone='203', bonus_balance=Decimal('2000'), payment_type='installment')
        plan = InstallmentPlan.objects.create(client=client, total_cost=Decimal('15000'), deadline=date(2025, 12, 1))
        PaymentService().add_installment_payment(str(plan.id), {'amount': Decimal('13000'), 'paid_at': date(2025, 3, 1)})
        plan.refresh_from_db(); client.refresh_from_db()
        assert plan.is_closed
        assert client.bonus_balance == Decimal('1300.00')

    def test_autoclosure_not_triggered_when_bonus_less_than_remaining(self):
        """Бонус 500 < остаток 2000 → автозакрытие НЕ происходит."""
        client = make_client(phone='204', bonus_balance=Decimal('500'), payment_type='installment')
        plan = InstallmentPlan.objects.create(client=client, total_cost=Decimal('15000'), deadline=date(2025, 12, 1))
        PaymentService().add_installment_payment(str(plan.id), {'amount': Decimal('13000'), 'paid_at': date(2025, 3, 1)})
        plan.refresh_from_db()
        assert not plan.is_closed

    def test_bonus_accrual_only_on_cash_paid_not_bonus_amount(self):
        """
        Бонус 3000, заплатил 12000 живыми → автозакрытие.
        Новый бонус: 10% от 12000 = 1200. Итого: 1200.
        """
        client = make_client(phone='205', bonus_balance=Decimal('3000'), payment_type='installment')
        plan = InstallmentPlan.objects.create(client=client, total_cost=Decimal('15000'), deadline=date(2025, 12, 1))
        PaymentService().add_installment_payment(str(plan.id), {'amount': Decimal('12000'), 'paid_at': date(2025, 3, 1)})
        plan.refresh_from_db(); client.refresh_from_db()
        assert plan.is_closed
        assert client.bonus_balance == Decimal('1200.00')

    def test_add_payment_to_closed_plan_raises(self):
        """Платёж в закрытую рассрочку → ошибка."""
        client = make_client(phone='206', payment_type='installment')
        plan = InstallmentPlan.objects.create(client=client, total_cost=Decimal('5000'), deadline=date(2025, 12, 1))
        InstallmentPayment.objects.create(plan=plan, amount=Decimal('5000'), paid_at=date(2025, 3, 1))
        with pytest.raises(ValidationError, match='already fully paid'):
            PaymentService().add_installment_payment(str(plan.id), {'amount': Decimal('100'), 'paid_at': date(2025, 4, 1)})

    def test_negative_amount_raises(self):
        """Отрицательная сумма → ошибка."""
        client = make_client(phone='207', payment_type='installment')
        plan = InstallmentPlan.objects.create(client=client, total_cost=Decimal('15000'), deadline=date(2025, 12, 1))
        with pytest.raises(ValidationError, match='positive'):
            PaymentService().add_installment_payment(str(plan.id), {'amount': Decimal('-100'), 'paid_at': date(2025, 3, 1)})


# ─────────────────────────────────────────────
# Тесты: re_enroll_client — НОВАЯ ЛОГИКА
# Бонус списывается ПРИ ЗАПИСИ, FullPayment = сумма после бонуса
# ─────────────────────────────────────────────

@pytest.mark.django_db
class TestReEnrollBonusAppliedAtEnrollment:

    def test_bonus_deducted_at_enrollment(self):
        """
        КЛЮЧЕВОЙ ТЕСТ: при записи бонус списывается сразу.
        Бонус 1400, курс 11700 → enrollment → bonus_balance = 0.
        """
        group = make_group(number=10)
        client = make_client(phone='301', bonus_balance=Decimal('1400'))
        ClientService().re_enroll_client(str(client.id), {
            'group_id':     str(group.id),
            'payment_type': 'full',
            'payment_data': {'amount': Decimal('11700')},
        })
        client.refresh_from_db()
        assert client.bonus_balance == Decimal('0')   # бонус списан при записи

    def test_full_payment_created_with_discounted_price(self):
        """
        FullPayment создаётся на ИТОГОВУЮ сумму (после бонуса).
        Бонус 1400, курс 11700 → FullPayment = 10300.
        """
        group = make_group(number=11)
        client = make_client(phone='302', bonus_balance=Decimal('1400'))
        ClientService().re_enroll_client(str(client.id), {
            'group_id':     str(group.id),
            'payment_type': 'full',
            'payment_data': {'amount': Decimal('11700')},
        })
        payment = FullPayment.objects.filter(client=client).order_by('-created_at').first()
        assert payment.amount == Decimal('10300.00')   # 11700 - 1400

    def test_no_bonus_no_discount(self):
        """Нет бонуса → FullPayment = полная цена."""
        group = make_group(number=12)
        client = make_client(phone='303', bonus_balance=Decimal('0'))
        ClientService().re_enroll_client(str(client.id), {
            'group_id':     str(group.id),
            'payment_type': 'full',
            'payment_data': {'amount': Decimal('15000')},
        })
        payment = FullPayment.objects.filter(client=client).order_by('-created_at').first()
        assert payment.amount == Decimal('15000.00')

    def test_bonus_transaction_created_at_enrollment(self):
        """При записи создаётся BonusTransaction: REDEMPTION."""
        group = make_group(number=13)
        client = make_client(phone='304', bonus_balance=Decimal('1400'))
        ClientService().re_enroll_client(str(client.id), {
            'group_id':     str(group.id),
            'payment_type': 'full',
            'payment_data': {'amount': Decimal('11700')},
        })
        txs = BonusTransaction.objects.filter(client=client)
        assert txs.count() == 1
        assert txs.first().transaction_type == BonusTransaction.REDEMPTION

    def test_full_cycle_enrollment_then_payment(self):
        """
        Полный цикл: запись → оплата.
        Бонус 1500, курс 15000:
          Запись:  -1500 (бонус списан), FullPayment = 13500
          Оплата:  +1350 (10% от 13500) → итого 1350
        """
        group = make_group(number=14)
        client = make_client(phone='305', bonus_balance=Decimal('1500'))

        ClientService().re_enroll_client(str(client.id), {
            'group_id':     str(group.id),
            'payment_type': 'full',
            'payment_data': {'amount': Decimal('15000')},
        })
        client.refresh_from_db()
        assert client.bonus_balance == Decimal('0')   # списан при записи

        payment = FullPayment.objects.filter(client=client).order_by('-created_at').first()
        assert payment.amount == Decimal('13500.00')   # 15000 - 1500

        PaymentService().mark_full_payment_paid(str(client.id))
        client.refresh_from_db()
        assert client.bonus_balance == Decimal('1350.00')   # 10% от 13500

    def test_bonus_larger_than_price_capped(self):
        """
        Бонус 5000 > цена 3000: списывается 3000, FullPayment = 0.
        """
        group = make_group(number=15)
        client = make_client(phone='306', bonus_balance=Decimal('5000'))
        ClientService().re_enroll_client(str(client.id), {
            'group_id':     str(group.id),
            'payment_type': 'full',
            'payment_data': {'amount': Decimal('3000')},
        })
        client.refresh_from_db()
        assert client.bonus_balance == Decimal('2000.00')   # 5000 - 3000
        payment = FullPayment.objects.filter(client=client).order_by('-created_at').first()
        assert payment.amount == Decimal('0.00')   # полностью покрыто бонусом

    def test_re_enroll_installment_bonus_applied(self):
        """Для рассрочки бонус тоже применяется при записи."""
        group = make_group(number=16)
        client = make_client(phone='307', bonus_balance=Decimal('2000'))
        ClientService().re_enroll_client(str(client.id), {
            'group_id':     str(group.id),
            'payment_type': 'installment',
            'payment_data': {'total_cost': Decimal('15000'), 'deadline': date(2025, 12, 31)},
        })
        client.refresh_from_db()
        assert client.bonus_balance == Decimal('0')   # бонус списан
        plan = InstallmentPlan.objects.filter(client=client).order_by('-created_at').first()
        assert plan.total_cost == Decimal('13000.00')   # 15000 - 2000

    def test_re_enroll_sets_is_repeat(self):
        """re_enroll ставит is_repeat=True."""
        group = make_group(number=17)
        client = make_client(phone='308')
        ClientService().re_enroll_client(str(client.id), {
            'group_id':     str(group.id),
            'payment_type': 'full',
            'payment_data': {'amount': Decimal('15000')},
        })
        client.refresh_from_db()
        assert client.is_repeat is True

    def test_re_enroll_sets_status_active(self):
        """re_enroll переводит клиента в active и привязывает к потоку."""
        group = make_group(number=18)
        client = make_client(phone='309')
        ClientService().re_enroll_client(str(client.id), {
            'group_id':     str(group.id),
            'payment_type': 'full',
            'payment_data': {'amount': Decimal('15000')},
        })
        client.refresh_from_db()
        assert client.status == 'active'
        assert client.group_id == group.id

    def test_re_enroll_to_completed_group_raises(self):
        """Нельзя записать в завершённый поток."""
        group = make_group(number=19, status='completed')
        client = make_client(phone='310')
        with pytest.raises(ValidationError, match='завершённый поток'):
            ClientService().re_enroll_client(str(client.id), {
                'group_id':     str(group.id),
                'payment_type': 'full',
                'payment_data': {'amount': Decimal('15000')},
            })
