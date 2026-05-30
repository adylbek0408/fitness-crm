from decimal import Decimal
from typing import Optional

from django.db import transaction

from core.services import BaseService
from core.exceptions import NotFoundError, ValidationError

from .models import Client, ClientAccount, ClientStatusHistory
from apps.payments.models import FullPayment, InstallmentPlan



def _generate_cabinet_username(client):
    import re
    digits = re.sub(r'\D', '', getattr(client, 'phone', '') or '')
    if not digits:
        return f"client_{str(client.id).replace('-', '')[:12]}"
    return digits


def _generate_cabinet_password():
    import secrets
    return secrets.token_urlsafe(10)


class ClientService(BaseService):

    # ── вспомогательные ────────────────────────────────────────────────────
    @staticmethod
    def _get_user_snap(user) -> str:
        """Возвращает ФИО пользователя для лога (снимок)."""
        if not user:
            return ''
        try:
            from apps.accounts.models import ManagerProfile
            mp = ManagerProfile.objects.get(user_id=user.pk)
            snap = f'{mp.last_name} {mp.first_name}'.strip()
            return snap or user.username
        except Exception:
            return (user.get_full_name() or '').strip() or user.username

    @staticmethod
    def _record_status_change(
        client: 'Client',
        old_status: str,
        new_status: str,
        user=None,
        note: str = '',
    ) -> None:
        """Записывает запись в ClientStatusHistory."""
        if old_status == new_status:
            return
        snap = ''
        if user:
            try:
                from apps.accounts.models import ManagerProfile
                mp = ManagerProfile.objects.get(user_id=user.pk)
                snap = f'{mp.last_name} {mp.first_name}'.strip() or user.username
            except Exception:
                snap = (user.get_full_name() or '').strip() or user.username
        ClientStatusHistory.objects.create(
            client=client,
            old_status=old_status,
            new_status=new_status,
            changed_by=user,
            changed_by_name=snap,
            note=note,
        )

    # ── CRUD ───────────────────────────────────────────────────────────────

    def get_client_or_raise(self, client_id: str) -> Client:
        try:
            return Client.objects.select_related(
                'group', 'trainer', 'registered_by', 'cabinet_account'
            ).get(id=client_id)
        except Client.DoesNotExist:
            raise NotFoundError(f"Client {client_id} not found")

    @transaction.atomic
    def create_client(self, data: dict, registered_by=None) -> Client:
        payment_data = data.pop('payment_data', {})
        payment_type = data.get('payment_type')

        if Client.objects.filter(phone=data.get('phone'), deleted_at__isnull=True).exists():
            raise ValidationError(f"Client with phone {data['phone']} already exists")

        if not data.get('is_repeat', False) and Decimal(str(data.get('discount', 0))) > 0:
            raise ValidationError("Discount can only be applied to repeat clients")

        client_type = data.get('client_type', 'regular')

        group_id = data.get('group_id')
        if client_type == 'trial':
            # Пробный клиент — никогда не добавляем в группу
            data.pop('group_id', None)
            data.pop('group', None)
            data['status'] = 'new'
        elif group_id:
            from apps.groups.models import Group
            try:
                # Soft-deleted groups must not be selectable for new enrollments.
                grp = Group.objects.get(id=group_id, deleted_at__isnull=True)
                if grp.status == 'completed':
                    raise ValidationError('Нельзя записать клиента в завершённую группу')
                data['status'] = 'active'
                if not data.get('trainer_id') and grp.trainer_id:
                    data['trainer_id'] = str(grp.trainer_id)
            except Group.DoesNotExist:
                raise ValidationError(f'Группа {group_id} не найдена')
        else:
            data['status'] = 'new'

        snap = ''
        if registered_by:
            from apps.accounts.models import ManagerProfile
            try:
                mp = ManagerProfile.objects.get(user_id=registered_by.id)
                snap = f'{mp.last_name} {mp.first_name}'.strip()
            except ManagerProfile.DoesNotExist:
                snap = (registered_by.get_full_name() or '').strip() or registered_by.username
            data['registered_by_name'] = snap

        google_email = (data.pop('google_email', '') or '').strip().lower()

        client = Client.objects.create(**data, registered_by=registered_by)

        # Логируем начальный статус
        self._record_status_change(
            client, old_status='', new_status=client.status,
            user=registered_by, note='Регистрация клиента',
        )

        plain_password = _generate_cabinet_password()
        username = _generate_cabinet_username(client)
        base_username = username
        counter = 0
        while ClientAccount.objects.filter(username=username).exists():
            counter += 1
            username = f"{base_username}_{counter}"
        account = ClientAccount.objects.create(client=client, username=username)
        account.set_password(plain_password)
        if google_email:
            account.google_email = google_email
            account.save(update_fields=['google_email'])

        if payment_type == 'full':
            self._create_full_payment(client, payment_data)
        elif payment_type == 'installment':
            self._create_installment_plan(client, payment_data)
        else:
            raise ValidationError(f"Invalid payment_type: {payment_type}")

        self.logger.info(f"Client created: {client.id}, payment_type: {payment_type}, client_type: {client_type}")
        client._cabinet_password_plain = plain_password
        client._cabinet_username_plain = username
        return client

    def _create_full_payment(self, client: Client, data: dict) -> FullPayment:
        amount = Decimal(str(data.get('amount', 0)))
        return FullPayment.objects.create(client=client, amount=amount)

    def _create_installment_plan(self, client: Client, data: dict) -> InstallmentPlan:
        if 'total_cost' not in data or 'deadline' not in data:
            raise ValidationError("Installment plan requires 'total_cost' and 'deadline'")
        return InstallmentPlan.objects.create(
            client=client,
            total_cost=data['total_cost'],
            deadline=data['deadline']
        )

    @transaction.atomic
    def update_client(self, client_id: str, data: dict) -> Client:
        client = self.get_client_or_raise(client_id)

        if 'payment_type' in data and data['payment_type'] != client.payment_type:
            raise ValidationError("Cannot change payment_type after registration")

        is_repeat = data.get('is_repeat', client.is_repeat)
        discount = Decimal(str(data.get('discount', client.discount)))
        if not is_repeat and discount > 0:
            raise ValidationError("Discount can only be applied to repeat clients")

        if 'group_id' in data and data['group_id']:
            from apps.groups.models import Group
            try:
                # Soft-deleted groups must not be selectable.
                grp = Group.objects.get(id=data['group_id'], deleted_at__isnull=True)
                if grp.status == 'completed':
                    raise ValidationError('Нельзя привязать клиента к завершённой группе')
            except Group.DoesNotExist:
                raise ValidationError(f'Группа не найдена')

        for field, value in data.items():
            setattr(client, field, value)
        client.save()
        return client

    def change_status(
        self,
        client_id: str,
        new_status: str = None,
        new_client_type: str = None,
        user=None,
    ) -> Client:
        client = self.get_client_or_raise(client_id)

        if new_status is not None:
            valid_statuses = ['expelled']
            if new_status not in valid_statuses:
                raise ValidationError("Ручная смена статуса доступна только для: Отчислен.")
            old_status = client.status
            client.status = new_status
            client.save(update_fields=['status'])
            self._record_status_change(client, old_status, new_status, user=user)

        if new_client_type is not None:
            valid_types = ['regular', 'frozen']
            if new_client_type not in valid_types:
                raise ValidationError("Ручная смена типа доступна только для: Обычный, Заморозка.")
            old_type = client.client_type
            client.client_type = new_client_type
            client.save(update_fields=['client_type'])
            if old_type != new_client_type:
                TYPE_LABEL = {'regular': 'Обычный', 'trial': 'Пробный', 'frozen': 'Заморозка'}
                self._record_status_change(
                    client,
                    old_status=f'тип:{old_type}',
                    new_status=f'тип:{new_client_type}',
                    user=user,
                    note=f'Смена типа клиента: {TYPE_LABEL.get(old_type, old_type)} → {TYPE_LABEL.get(new_client_type, new_client_type)}',
                )

        return client

    @transaction.atomic
    def assign_to_group(self, client_id: str, group_id: str, user=None) -> Client:
        from apps.groups.models import Group
        client = self.get_client_or_raise(client_id)
        if client.group_id and str(client.group_id) != str(group_id):
            raise ValidationError(f'Клиент уже в группе #{client.group.number}')
        try:
            # Skip soft-deleted groups so they can't be reassigned to.
            group = Group.objects.get(id=group_id, deleted_at__isnull=True)
        except Group.DoesNotExist:
            raise NotFoundError(f"Group {group_id} not found")
        if group.status == 'completed':
            raise ValidationError('Нельзя добавить в завершённую группу')
        old_status = client.status
        client.group = group
        fields = ['group']
        if group.trainer_id:
            client.trainer = group.trainer
            fields.append('trainer')
        if client.status == 'new' or client.client_type in ('frozen', 'trial'):
            client.status = 'active'
            fields.append('status')
            if client.client_type in ('frozen', 'trial'):
                client.client_type = 'regular'
                fields.append('client_type')
        if client.training_format != group.training_format:
            client.training_format = group.training_format
            fields.append('training_format')
        if group.group_type and client.group_type != group.group_type:
            client.group_type = group.group_type
            fields.append('group_type')
        client.save(update_fields=fields)
        if old_status != client.status:
            self._record_status_change(
                client, old_status, client.status, user=user,
                note=f'Добавлен в группу #{group.number}',
            )
        return client

    @transaction.atomic
    def add_new_client_to_group(self, client_id: str, group_id: str) -> Client:
        """Запись в поток без новой оплаты (оплата уже закрыта): «Новый», «Пробный» или «Заморозка» без флага повторного клиента."""
        from apps.groups.models import Group

        client = self.get_client_or_raise(client_id)

        is_frozen = client.client_type == 'frozen'
        is_trial = client.client_type == 'trial'
        if client.status != 'new' and not is_frozen and not is_trial:
            raise ValidationError(
                'Доступно только для клиентов со статусом «Новый» или типом «Заморозка».'
            )
        if is_frozen and client.is_repeat:
            raise ValidationError(
                'Замороженного повторного клиента запишите через «Повторная запись» с новой оплатой.'
            )
        if is_frozen:
            has_payment = (
                FullPayment.objects.filter(client=client).exists() or
                InstallmentPlan.objects.filter(client=client).exists()
            )
            if not has_payment:
                raise ValidationError(
                    'Клиент заморожен без оплаты (возврат). Используйте «Повторная запись» с новой оплатой.'
                )
        if client.group_id:
            raise ValidationError(f'Клиент уже в группе #{client.group.number}.')

        try:
            # Skip soft-deleted groups.
            group = Group.objects.get(id=group_id, deleted_at__isnull=True)
        except Group.DoesNotExist:
            raise ValidationError(f'Группа {group_id} не найдена')
        if group.status == 'completed':
            raise ValidationError('Нельзя записать в завершённую группу')

        return self.assign_to_group(client_id, group_id)

    @transaction.atomic
    def remove_from_group(self, client_id: str, group_id: str) -> Client:
        client = self.get_client_or_raise(client_id)
        if client.group_id and str(client.group_id) != str(group_id):
            raise ValidationError('Клиент не в этой группе')
        client.group = None
        client.save(update_fields=['group'])
        return client

    @transaction.atomic
    def cancel_payment(self, client_id: str, user=None) -> dict:
        """
        Отмена текущей оплаты без возврата денег (коррекция ввода).
        Клиент остаётся в базе, статус 'new' (или client_type='trial' если пробный), без группы и оплаты.
        """
        from apps.clients.bonus_service import BonusService

        client = self.get_client_or_raise(client_id)

        bonus_svc = BonusService()
        voided = Decimal('0')

        if client.payment_type == 'full':
            fp = FullPayment.objects.filter(client=client).order_by('-created_at').first()
            if fp:
                voided = bonus_svc.void_accruals_for_refund(client, full_payment=fp, user=user)
                fp.delete()

        elif client.payment_type == 'installment':
            ip = InstallmentPlan.objects.filter(client=client).order_by('-created_at').first()
            if ip:
                voided = bonus_svc.void_accruals_for_refund(client, installment_plan=ip, user=user)
                ip.payments.all().delete()
                ip.delete()

        self.logger.info(
            f'Payment cancelled for client {client_id}. '
            f'Voided bonus accruals: {voided}.'
        )

        return {
            'detail': 'Оплата отменена. Введите новый тип оплаты.',
            'voided_bonus': str(voided),
        }

    @transaction.atomic
    def enter_payment_for_client(self, client_id: str, data: dict, user=None) -> 'Client':
        """
        Ввод/повторный ввод оплаты для клиента со статусом «Новый» или «Пробный»,
        у которого нет активной оплаты (например, после отмены).
        """
        client = self.get_client_or_raise(client_id)

        existing_fp = FullPayment.objects.filter(client=client).order_by('-created_at').first()
        existing_ip = InstallmentPlan.objects.filter(client=client).order_by('-created_at').first()
        if existing_fp or existing_ip:
            raise ValidationError('У клиента уже есть активная оплата. Сначала отмените её.')

        payment_type = data.get('payment_type')
        payment_data = data.get('payment_data', {})
        bonus_percent_raw = data.get('bonus_percent')

        if bonus_percent_raw is not None and bonus_percent_raw != '':
            try:
                bp = int(bonus_percent_raw)
            except (TypeError, ValueError):
                raise ValidationError('Процент бонуса должен быть целым числом.')
            if bp < 0 or bp > 100:
                raise ValidationError('Процент бонуса должен быть от 0 до 100.')
            client.bonus_percent = bp

        if payment_type == 'full':
            amount = Decimal(str(payment_data.get('amount', 0)))
            if amount <= 0:
                raise ValidationError('Сумма оплаты должна быть положительной.')
            FullPayment.objects.create(client=client, amount=amount)
            client.payment_type = 'full'

        elif payment_type == 'installment':
            total_cost = Decimal(str(payment_data.get('total_cost', 0)))
            deadline = payment_data.get('deadline')
            if not total_cost or not deadline:
                raise ValidationError('Для рассрочки нужны total_cost и deadline.')
            if total_cost <= 0:
                raise ValidationError('Сумма рассрочки должна быть положительной.')
            InstallmentPlan.objects.create(client=client, total_cost=total_cost, deadline=deadline)
            client.payment_type = 'installment'

        else:
            raise ValidationError('payment_type должен быть «full» или «installment».')

        client.save(update_fields=['payment_type', 'bonus_percent'])
        client.refresh_from_db()

        self.logger.info(
            f'Payment entered for client {client_id}: type={payment_type}'
        )
        return client

    def reset_cabinet_password(self, client_id: str) -> str:
        import secrets as _secrets
        client = self.get_client_or_raise(client_id)
        try:
            account = client.cabinet_account
        except ClientAccount.DoesNotExist:
            raise ValidationError("У клиента нет кабинета")
        plain = _generate_cabinet_password()
        account.set_password(plain)
        # Rotate session_key so all existing JWT tokens are invalidated immediately.
        ClientAccount.objects.filter(pk=account.pk).update(session_key=_secrets.token_urlsafe(32))
        return plain

    @transaction.atomic
    def re_enroll_client(self, client_id: str, data: dict, user=None) -> Client:
        from apps.groups.models import Group
        from apps.clients.bonus_service import BonusService
        from .models import ClientGroupHistory

        client = self.get_client_or_raise(client_id)

        if client.client_type == 'trial':
            raise ValidationError('Пробный клиент не может быть записан в группу.')

        if client.status == 'new' and client.client_type != 'frozen':
            raise ValidationError(
                'Клиент со статусом «Новый» записывается через «Добавить в группу» без новой оплаты.'
            )

        client_status_before = client.status

        if client.group:
            raise ValidationError(
                f'Клиент уже в группе #{client.group.number}. '
                'Сначала сделайте возврат или закройте группу.'
            )

        if client.payment_type == 'full':
            fp = FullPayment.objects.filter(client=client).order_by('-created_at').first()
            if fp and not fp.is_paid:
                raise ValidationError(
                    'Нельзя записать в новую группу — предыдущая оплата ещё не подтверждена.'
                )
        elif client.payment_type == 'installment':
            ip = InstallmentPlan.objects.filter(client=client).order_by('-created_at').first()
            if ip and not ip.is_closed:
                raise ValidationError(
                    f'Нельзя записать в новую группу — есть непогашенный остаток: {ip.remaining} сом.'
                )

        group_id     = data.get('group_id')
        payment_type = data.get('payment_type')
        payment_data = data.get('payment_data', {})

        bonus_percent_raw = data.get('bonus_percent')
        bonus_percent_updated = False
        if bonus_percent_raw is not None and bonus_percent_raw != '':
            if isinstance(bonus_percent_raw, (list, tuple)):
                bonus_percent_raw = bonus_percent_raw[0] if bonus_percent_raw else ''
            try:
                bp = int(bonus_percent_raw)
            except (TypeError, ValueError):
                raise ValidationError('Процент бонуса должен быть целым числом')
            if bp < 0 or bp > 100:
                raise ValidationError('Процент бонуса должен быть от 0 до 100')
            client.bonus_percent = bp
            bonus_percent_updated = True

        if not group_id:
            raise ValidationError('group_id обязателен')
        if payment_type not in ('full', 'installment'):
            raise ValidationError('payment_type должен быть full или installment')

        try:
            # Skip soft-deleted groups.
            group = Group.objects.get(id=group_id, deleted_at__isnull=True)
        except Group.DoesNotExist:
            raise ValidationError(f'Группа {group_id} не найдена')
        if group.status == 'completed':
            raise ValidationError('Нельзя записать в завершённую группу')

        if (
            not client.is_repeat
            and ClientGroupHistory.objects.filter(client=client).exists()
        ):
            client.is_repeat = True

        client.payment_type = payment_type
        bonus_svc = BonusService()

        if payment_type == 'full':
            full_price = Decimal(str(payment_data.get('amount', 0)))
            if full_price <= 0:
                raise ValidationError('Сумма оплаты должна быть положительной')
            client.refresh_from_db(fields=['bonus_balance'])
            if client.bonus_balance > Decimal('0'):
                result      = bonus_svc.apply(str(client.pk), full_price, created_by=user)
                final_price = result['final_price']
            else:
                final_price = full_price
            FullPayment.objects.create(
                client=client,
                amount=final_price,
                course_amount=full_price,
            )

        elif payment_type == 'installment':
            total_cost = Decimal(str(payment_data.get('total_cost', 0)))
            deadline   = payment_data.get('deadline')
            if not total_cost or not deadline:
                raise ValidationError('Для рассрочки нужны total_cost и deadline')
            if total_cost <= 0:
                raise ValidationError('Сумма рассрочки должна быть положительной')
            client.refresh_from_db(fields=['bonus_balance'])
            if client.bonus_balance > Decimal('0'):
                result     = bonus_svc.apply(str(client.pk), total_cost, created_by=user)
                final_cost = result['final_price']
            else:
                final_cost = total_cost
            InstallmentPlan.objects.create(client=client, total_cost=final_cost, deadline=deadline)

        client.group  = group
        client.status = 'active'
        save_fields = ['is_repeat', 'payment_type', 'group', 'status']
        if bonus_percent_updated:
            save_fields.append('bonus_percent')
        client.save(update_fields=save_fields)
        self._record_status_change(
            client, old_status=client_status_before, new_status='active',
            user=user, note=f'Повторная запись в группу #{group.number}',
        )
        client.refresh_from_db()
        return client

    @transaction.atomic
    def create_reservation(self, client_id: str, data: dict, user=None):
        """Создать бронь следующей группы для активного клиента."""
        from apps.groups.models import Group
        from .models import ClientGroupReservation

        client = self.get_client_or_raise(client_id)

        if client.status != 'active' or not client.group_id:
            raise ValidationError('Бронь доступна только для активных клиентов, находящихся в группе.')

        if ClientGroupReservation.objects.filter(client=client, used_at__isnull=True).exists():
            raise ValidationError('У клиента уже есть активная бронь. Сначала отмените её.')

        group_id = data.get('group_id')
        if not group_id:
            raise ValidationError('group_id обязателен.')

        try:
            group = Group.objects.get(id=group_id, deleted_at__isnull=True)
        except Group.DoesNotExist:
            raise ValidationError(f'Группа {group_id} не найдена.')
        if group.status == 'completed':
            raise ValidationError('Нельзя бронировать завершённую группу.')
        if str(group.id) == str(client.group_id):
            raise ValidationError('Нельзя бронировать текущую группу клиента.')

        payment_type = data.get('payment_type')
        if payment_type not in ('full', 'installment'):
            raise ValidationError('payment_type должен быть full или installment.')

        payment_amount = None
        total_cost = None
        deadline = None

        if payment_type == 'full':
            raw = data.get('payment_amount') or data.get('amount')
            if not raw:
                raise ValidationError('Для полной оплаты укажите payment_amount.')
            payment_amount = Decimal(str(raw))
            if payment_amount <= 0:
                raise ValidationError('Сумма оплаты должна быть положительной.')
        else:
            raw_cost = data.get('total_cost')
            raw_dl = data.get('deadline')
            if not raw_cost or not raw_dl:
                raise ValidationError('Для рассрочки укажите total_cost и deadline.')
            total_cost = Decimal(str(raw_cost))
            if total_cost <= 0:
                raise ValidationError('Сумма рассрочки должна быть положительной.')
            deadline = raw_dl

        bp_raw = data.get('bonus_percent', client.bonus_percent)
        try:
            bp = int(bp_raw)
        except (TypeError, ValueError):
            bp = client.bonus_percent
        bp = max(0, min(100, bp))

        snap = self._get_user_snap(user) if user else ''

        reservation = ClientGroupReservation.objects.create(
            client=client,
            reserved_group=group,
            payment_type=payment_type,
            payment_amount=payment_amount,
            total_cost=total_cost,
            deadline=deadline,
            bonus_percent=bp,
            reserved_by=user,
            reserved_by_name=snap,
            note=data.get('note', ''),
        )
        self.logger.info(f"Reservation created: client {client_id} → group {group_id}")
        return reservation

    def cancel_reservation(self, client_id: str, user=None) -> None:
        """Отменить активную бронь клиента."""
        from .models import ClientGroupReservation

        client = self.get_client_or_raise(client_id)
        reservation = ClientGroupReservation.objects.filter(client=client, used_at__isnull=True).first()
        if not reservation:
            raise ValidationError('У клиента нет активной брони.')
        reservation.delete()
        self.logger.info(f"Reservation cancelled: client {client_id}")

    @transaction.atomic
    def refund_client(self, client_id: str, user=None, retention_amount: Optional[Decimal] = None) -> dict:
        from apps.clients.bonus_service import BonusService
        from apps.payments.models import RefundLog

        if retention_amount is None:
            retention_amount = Decimal('0')
        retention_amount = retention_amount.quantize(Decimal('0.01'))
        if retention_amount < Decimal('0'):
            raise ValidationError('Сумма удержания не может быть отрицательной.')

        client = self.get_client_or_raise(client_id)
        refunded_pay_type = client.payment_type
        client_status_before_refund = client.status

        total_paid = Decimal('0')
        refund_to_client = Decimal('0')
        latest_fp = None
        latest_ip = None
        bonus_voided = Decimal('0')
        bonus_svc = BonusService()

        if client.payment_type == 'full':
            latest_fp = FullPayment.objects.filter(client=client).order_by('-created_at').first()
            if latest_fp:
                total_paid = latest_fp.amount if latest_fp.is_paid else Decimal('0')
                if retention_amount > total_paid:
                    raise ValidationError(
                        f'Удержание ({retention_amount} сом) не может превышать оплаченную сумму ({total_paid} сом).'
                    )
                refund_to_client = total_paid - retention_amount
                bonus_voided = bonus_svc.void_accruals_for_refund(
                    client, full_payment=latest_fp, user=user
                )
                latest_fp.delete()

        elif client.payment_type == 'installment':
            latest_ip = InstallmentPlan.objects.filter(client=client).order_by('-created_at').first()
            if latest_ip:
                total_paid = latest_ip.total_paid
                if retention_amount > total_paid:
                    raise ValidationError(
                        f'Удержание ({retention_amount} сом) не может превышать оплаченную сумму ({total_paid} сом).'
                    )
                refund_to_client = total_paid - retention_amount
                bonus_voided = bonus_svc.void_accruals_for_refund(
                    client, installment_plan=latest_ip, user=user
                )
                latest_ip.payments.all().delete()
                latest_ip.delete()

        if not latest_fp and not latest_ip and retention_amount > Decimal('0'):
            raise ValidationError('Нет оплаты для возврата.')

        client.refresh_from_db(fields=['bonus_balance'])

        note_parts = [
            'Возврат оплаты; клиент переведён в «Заморозка».',
            f' Оплачено было: {total_paid} сом; удержание: {retention_amount} сом; к возврату клиенту: {refund_to_client} сом.',
        ]
        if bonus_voided > Decimal('0'):
            note_parts.append(f' Аннулировано бонусов с этой оплаты: {bonus_voided} сом.')

        RefundLog.objects.create(
            client_name=client.full_name,
            client_id=str(client.id),
            amount=refund_to_client,
            retention_amount=retention_amount,
            total_paid=total_paid,
            payment_type=refunded_pay_type,
            note=''.join(note_parts),
            created_by=user,
        )

        remaining_fp = FullPayment.objects.filter(client=client).order_by('-created_at').first()
        remaining_ip = InstallmentPlan.objects.filter(client=client).order_by('-created_at').first()
        if remaining_ip and (not remaining_fp or remaining_ip.created_at > remaining_fp.created_at):
            client.payment_type = 'installment'
        elif remaining_fp:
            client.payment_type = 'full'

        old_type = client.client_type
        client.group = None
        client.client_type = 'frozen'
        client.save(update_fields=['group', 'client_type', 'payment_type'])

        if old_type != 'frozen':
            TYPE_LABEL = {'regular': 'Обычный', 'trial': 'Пробный', 'frozen': 'Заморозка'}
            self._record_status_change(
                client,
                old_status=f'тип:{old_type}',
                new_status='тип:frozen',
                user=user,
                note='Возврат средств — клиент переведён в Заморозку',
            )

        self.logger.info(
            f'Client {client_id} refunded → frozen. '
            f'refund_to_client={refund_to_client}, retention={retention_amount}, bonus_voided={bonus_voided}.'
        )

        detail = (
            f'К возврату клиенту: {refund_to_client} сом'
            + (f' (удержание: {retention_amount} сом)' if retention_amount > Decimal('0') else '')
            + '. Оплата снята в системе.'
        )
        if bonus_voided > Decimal('0'):
            detail += f' Аннулировано бонусов с этой оплаты: {bonus_voided} сом.'
        if client.bonus_balance < Decimal('0'):
            detail += f' Бонусный баланс: {client.bonus_balance} сом (задолженность по бонусам).'
        detail += ' Клиент переведён в статус «Заморозка».'

        return {
            'action': 'frozen',
            'detail': detail,
            'refund_to_client': str(refund_to_client),
            'retention_amount': str(retention_amount),
            'total_paid': str(total_paid),
            'bonus_voided': str(bonus_voided),
            'bonus_balance': str(client.bonus_balance),
        }
