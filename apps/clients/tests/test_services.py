import pytest
from decimal import Decimal
from datetime import date

from core.exceptions import ValidationError

from apps.clients.models import Client
from apps.clients.services import ClientService
from apps.payments.models import FullPayment, InstallmentPlan
from apps.payments.services import PaymentService


@pytest.mark.django_db
class TestClientService:
    def test_create_client_with_full_payment(self):
        service = ClientService()
        data = {
            'first_name': 'John',
            'last_name': 'Doe',
            'phone': '+79991234567',
            'training_format': 'offline',
            'group_type': '1.5h',
            'payment_type': 'full',
            'payment_data': {'amount': Decimal('5000.00')},
        }
        client = service.create_client(data)
        assert client.first_name == 'John'
        assert client.last_name == 'Doe'
        assert client.phone == '+79991234567'
        assert client.status == 'new'
        assert client.payment_type == 'full'
        full_payment = FullPayment.objects.get(client=client)
        assert full_payment.amount == Decimal('5000.00')

    def test_create_client_with_installment_plan(self):
        service = ClientService()
        data = {
            'first_name': 'Jane',
            'last_name': 'Smith',
            'phone': '+79991234568',
            'training_format': 'offline',
            'group_type': '2.5h',
            'payment_type': 'installment',
            'payment_data': {
                'total_cost': Decimal('10000.00'),
                'deadline': date(2025, 6, 1),
            },
        }
        client = service.create_client(data)
        assert client.status == 'new'
        assert client.payment_type == 'installment'
        plan = InstallmentPlan.objects.get(client=client)
        assert plan.total_cost == Decimal('10000.00')
        assert plan.deadline == date(2025, 6, 1)

    def test_create_client_duplicate_phone_raises(self):
        service = ClientService()
        existing_client = Client.objects.create(
            first_name='Existing',
            last_name='User',
            phone='+79991234569',
            training_format='offline',
            group_type='1.5h',
            payment_type='full'
        )
        FullPayment.objects.create(client=existing_client, amount=Decimal('5000.00'))
        data = {
            'first_name': 'John',
            'last_name': 'Doe',
            'phone': '+79991234569',
            'training_format': 'offline',
            'group_type': '1.5h',
            'payment_type': 'full',
            'payment_data': {'amount': Decimal('5000.00')},
        }
        with pytest.raises(ValidationError) as exc_info:
            service.create_client(data)
        assert 'already exists' in str(exc_info.value)

    def test_create_client_discount_without_repeat_raises(self):
        service = ClientService()
        data = {
            'first_name': 'John',
            'last_name': 'Doe',
            'phone': '+79991234570',
            'training_format': 'offline',
            'group_type': '1.5h',
            'payment_type': 'full',
            'payment_data': {'amount': Decimal('5000.00')},
            'is_repeat': False,
            'discount': Decimal('10.00'),
        }
        with pytest.raises(ValidationError) as exc_info:
            service.create_client(data)
        assert 'Discount' in str(exc_info.value)

    def test_update_client_payment_type_change_raises(self):
        service = ClientService()
        data = {
            'first_name': 'John',
            'last_name': 'Doe',
            'phone': '+79991234571',
            'training_format': 'offline',
            'group_type': '1.5h',
            'payment_type': 'full',
            'payment_data': {'amount': Decimal('5000.00')},
        }
        client = service.create_client(data)
        with pytest.raises(ValidationError) as exc_info:
            service.update_client(str(client.id), {'payment_type': 'installment'})
        assert 'payment_type' in str(exc_info.value).lower()

    def test_change_status_invalid_raises(self):
        service = ClientService()
        client = Client.objects.create(
            first_name='John',
            last_name='Doe',
            phone='+79991234572',
            training_format='offline',
            group_type='1.5h',
            payment_type='full'
        )
        FullPayment.objects.create(client=client, amount=Decimal('5000.00'))
        with pytest.raises(ValidationError) as exc_info:
            service.change_status(str(client.id), 'invalid_status')
        assert 'Invalid status' in str(exc_info.value)

    def test_change_status_active_without_group_raises(self):
        service = ClientService()
        client = Client.objects.create(
            first_name='Jane',
            last_name='Doe',
            phone='+79991234573',
            training_format='offline',
            group_type='1.5h',
            payment_type='full',
            status='new',
        )
        with pytest.raises(ValidationError) as exc_info:
            service.change_status(str(client.id), 'active')
        assert 'поток' in str(exc_info.value).lower()

    def test_add_new_client_to_group_sets_active(self):
        from apps.groups.models import Group
        from apps.trainers.models import Trainer

        service = ClientService()
        trainer = Trainer.objects.create(first_name='Иван', last_name='Иванов')
        group = Group.objects.create(
            number='9001',
            group_type='1.5h',
            training_format='offline',
            start_date=date(2025, 1, 1),
            trainer=trainer,
            status='recruitment',
        )
        client = Client.objects.create(
            first_name='Нов',
            last_name='Клиент',
            phone='+79997777701',
            training_format='offline',
            group_type='1.5h',
            payment_type='full',
            status='new',
        )
        FullPayment.objects.create(client=client, amount=Decimal('5000.00'), is_paid=True)
        out = service.add_new_client_to_group(str(client.id), str(group.id))
        out.refresh_from_db()
        assert out.status == 'active'
        assert out.group_id == group.id
        assert out.trainer_id == trainer.id

    def test_refund_new_client_freezes_keeps_record(self):
        """Возврат у клиента без истории потоков не удаляет карточку — статус «Заморозка»."""
        from apps.clients.models import Client

        service = ClientService()
        client = Client.objects.create(
            first_name='Возврат',
            last_name='Тест',
            phone='+79997777801',
            training_format='offline',
            group_type='1.5h',
            payment_type='full',
            status='new',
            is_repeat=False,
        )
        cid = str(client.id)
        fp = FullPayment.objects.create(client=client, amount=Decimal('8000.00'))
        PaymentService().mark_full_payment_paid(cid)

        result = service.refund_client(cid, user=None)
        assert result['action'] == 'frozen'
        assert Client.objects.filter(id=cid).exists()
        client.refresh_from_db()
        assert client.status == 'frozen'
        assert client.is_repeat is False
        assert not FullPayment.objects.filter(client_id=cid).exists()
        # 10% бонус с 8000 = 800 — аннулирован при возврате
        assert client.bonus_balance == Decimal('0')

    def test_refund_partial_retention_and_void_bonus(self):
        """Частичный возврат: к клиенту = оплата − удержание; бонусы с оплаты аннулируются."""
        from apps.payments.models import FullPayment, RefundLog
        from apps.clients.models import BonusTransaction

        service = ClientService()
        client = Client.objects.create(
            first_name='Част',
            last_name='Возврат',
            phone='+79997777802',
            training_format='offline',
            group_type='1.5h',
            payment_type='full',
            status='new',
        )
        cid = str(client.id)
        FullPayment.objects.create(client=client, amount=Decimal('12000.00'))
        PaymentService().mark_full_payment_paid(cid)
        client.refresh_from_db()
        assert client.bonus_balance == Decimal('1200.00')  # 10%

        result = service.refund_client(
            cid, user=None, retention_amount=Decimal('2100.00'),
        )
        assert result['action'] == 'frozen'
        assert result['refund_to_client'] == '9900.00'
        assert result['retention_amount'] == '2100.00'
        assert result['bonus_voided'] == '1200.00'

        client.refresh_from_db()
        assert client.bonus_balance == Decimal('0')
        assert not FullPayment.objects.filter(client_id=cid).exists()

        log = RefundLog.objects.filter(client_id=cid).order_by('-created_at').first()
        assert log.amount == Decimal('9900.00')
        assert log.retention_amount == Decimal('2100.00')
        assert log.total_paid == Decimal('12000.00')

        void_tx = BonusTransaction.objects.filter(
            client_id=cid, transaction_type=BonusTransaction.REDEMPTION,
        ).order_by('-created_at').first()
        assert void_tx is not None
        assert 'Аннулирование бонусов' in (void_tx.description or '')

    def test_refund_bonus_negative_balance_if_spent(self):
        """Если часть бонусов уже потрачена — баланс уходит в минус после аннулирования."""
        from apps.payments.models import FullPayment
        from apps.clients.bonus_service import BonusService

        service = ClientService()
        client = Client.objects.create(
            first_name='Минус',
            last_name='Бонус',
            phone='+79997777803',
            training_format='offline',
            group_type='1.5h',
            payment_type='full',
            status='completed',
        )
        cid = str(client.id)
        FullPayment.objects.create(client=client, amount=Decimal('12000.00'))
        PaymentService().mark_full_payment_paid(cid)
        client.refresh_from_db()
        # «Потратил» 500 бонусов: списание вручную
        BonusService().apply(cid, Decimal('500'), created_by=None)
        client.refresh_from_db()
        assert client.bonus_balance == Decimal('700.00')  # 1200 - 500

        service.refund_client(cid, user=None, retention_amount=Decimal('0'))
        client.refresh_from_db()
        # 1200 аннулировано → 700 - 1200 = -500
        assert client.bonus_balance == Decimal('-500.00')

    def test_refund_retention_exceeds_paid_raises(self):
        from apps.payments.models import FullPayment

        service = ClientService()
        client = Client.objects.create(
            first_name='Ошиб',
            last_name='Удерж',
            phone='+79997777804',
            training_format='offline',
            group_type='1.5h',
            payment_type='full',
            status='new',
        )
        cid = str(client.id)
        FullPayment.objects.create(client=client, amount=Decimal('1000.00'))
        PaymentService().mark_full_payment_paid(cid)

        with pytest.raises(ValidationError):
            service.refund_client(cid, user=None, retention_amount=Decimal('5000.00'))

    def test_re_enroll_rejects_status_new(self):
        from apps.groups.models import Group
        from apps.trainers.models import Trainer

        service = ClientService()
        trainer = Trainer.objects.create(first_name='Пётр', last_name='Петров')
        group = Group.objects.create(
            number='9002',
            group_type='1.5h',
            training_format='offline',
            start_date=date(2025, 1, 1),
            trainer=trainer,
            status='recruitment',
        )
        client = Client.objects.create(
            first_name='Нов2',
            last_name='Клиент',
            phone='+79997777702',
            training_format='offline',
            group_type='1.5h',
            payment_type='full',
            status='new',
        )
        FullPayment.objects.create(client=client, amount=Decimal('1000.00'), is_paid=True)
        with pytest.raises(ValidationError) as exc_info:
            service.re_enroll_client(str(client.id), {
                'group_id': str(group.id),
                'payment_type': 'full',
                'payment_data': {'amount': Decimal('1000')},
            })
        assert 'Новый' in str(exc_info.value) or 'новый' in str(exc_info.value).lower()

    def test_re_enroll_saves_bonus_percent(self):
        from apps.groups.models import Group
        from apps.trainers.models import Trainer

        service = ClientService()
        trainer = Trainer.objects.create(first_name='Бон', last_name='Ус')
        group = Group.objects.create(
            number='9003',
            group_type='1.5h',
            training_format='offline',
            start_date=date(2025, 2, 1),
            trainer=trainer,
            status='recruitment',
        )
        client = Client.objects.create(
            first_name='Повт',
            last_name='Бонус',
            phone='+79997777703',
            training_format='offline',
            group_type='1.5h',
            payment_type='full',
            status='frozen',
            bonus_percent=0,
        )
        FullPayment.objects.create(
            client=client, amount=Decimal('1000.00'), is_paid=True,
        )
        service.re_enroll_client(str(client.id), {
            'group_id': str(group.id),
            'payment_type': 'full',
            'payment_data': {'amount': Decimal('5000')},
            'bonus_percent': 5,
        })
        client.refresh_from_db()
        assert client.bonus_percent == 5
        assert client.group_id == group.id
