from decimal import Decimal
from typing import Optional

from django.db import transaction

from core.services import BaseService
from core.exceptions import NotFoundError, ValidationError

from .models import Client, ClientAccount
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

        group_id = data.get('group_id')
        if group_id:
            from apps.groups.models import Group
            try:
                grp = Group.objects.get(id=group_id)
                if grp.status == 'completed':
                    raise ValidationError('Нельзя записать клиента в завершённый поток')
                data['status'] = 'active'
                if not data.get('trainer_id') and grp.trainer_id:
                    data['trainer_id'] = str(grp.trainer_id)
            except Group.DoesNotExist:
                raise ValidationError(f'Поток {group_id} не найден')
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

        client = Client.objects.create(**data, registered_by=registered_by)

        plain_password = _generate_cabinet_password()
        username = _generate_cabinet_username(client)
        base_username = username
        counter = 0
        while ClientAccount.objects.filter(username=username).exists():
            counter += 1
            username = f"{base_username}_{counter}"
        account = ClientAccount.objects.create(client=client, username=username)
        account.set_password(plain_password)

        if payment_type == 'full':
            self._create_full_payment(client, payment_data)
        elif payment_type == 'installment':
            self._create_installment_plan(client, payment_data)
        else:
            raise ValidationError(f"Invalid payment_type: {payment_type}")

        self.logger.info(f"Client created: {client.id}, payment_type: {payment_type}")
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
                grp = Group.objects.get(id=data['group_id'])
                if grp.status == 'completed':
                    raise ValidationError('Нельзя привязать клиента к завершённому потоку')
            except Group.DoesNotExist:
                raise ValidationError(f'Поток не найден')

        for field, value in data.items():
            setattr(client, field, value)
        client.save()
        return client

    def change_status(self, client_id: str, new_status: str) -> Client:
        valid_statuses = ['active', 'completed', 'expelled', 'frozen']
        if new_status not in valid_statuses:
            raise ValidationError(f"Invalid status: {new_status}")
        client = self.get_client_or_raise(client_id)
        if new_status == 'active' and not client.group_id:
            raise ValidationError('Статус «Активный» доступен только у клиента, записанного в поток.')
        client.status = new_status
        client.save(update_fields=['status'])
        return client

    @transaction.atomic
    def assign_to_group(self, client_id: str, group_id: str) -> Client:
        from apps.groups.models import Group
        client = self.get_client_or_raise(client_id)
        if client.group_id and str(client.group_id) != str(group_id):
            raise ValidationError(f'Клиент уже в Потоке #{client.group.number}')
        try:
            group = Group.objects.get(id=group_id)
        except Group.DoesNotExist:
            raise NotFoundError(f"Group {group_id} not found")
        if group.status == 'completed':
            raise ValidationError('Нельзя добавить в завершённый поток')
        client.group = group
        fields = ['group']
        if group.trainer_id:
            client.trainer = group.trainer
            fields.append('trainer')
        if client.status in ('new', 'frozen'):
            client.status = 'active'
            fields.append('status')
        client.save(update_fields=fields)
        return client

    @transaction.atomic
    def add_new_client_to_group(self, client_id: str, group_id: str) -> Client:
        """Запись в поток без новой оплаты (оплата уже закрыта): «Новый» или «Заморозка» без флага повторного клиента."""
        from apps.groups.models import Group

        client = self.get_client_or_raise(client_id)

        if client.status not in ('new', 'frozen'):
            raise ValidationError(
                'Доступно только для клиентов со статусом «Новый» или «Заморозка».'
            )
        if client.status == 'frozen' and client.is_repeat:
            raise ValidationError(
                'Замороженного повторного клиента запишите через «Повторная запись» с новой оплатой.'
            )
        if client.group_id:
            raise ValidationError(f'Клиент уже в Потоке #{client.group.number}.')

        if client.payment_type == 'full':
            fp = FullPayment.objects.filter(client=client).order_by('-created_at').first()
            if not fp:
                raise ValidationError(
                    'Нет подтверждённой полной оплаты. Оформите оплату (например, через повторную запись в поток).'
                )
            if not fp.is_paid:
                raise ValidationError('Сначала подтвердите полную оплату.')
        elif client.payment_type == 'installment':
            ip = InstallmentPlan.objects.filter(client=client).order_by('-created_at').first()
            if not ip:
                raise ValidationError(
                    'Нет плана рассрочки. Оформите оплату (например, через повторную запись в поток).'
                )
            if not ip.is_closed:
                raise ValidationError(
                    f'Нельзя добавить в поток — есть непогашенный остаток: {ip.remaining} сом.'
                )

        try:
            group = Group.objects.get(id=group_id)
        except Group.DoesNotExist:
            raise ValidationError(f'Поток {group_id} не найден')
        if group.status == 'completed':
            raise ValidationError('Нельзя записать в завершённый поток')
        if group.training_format != client.training_format:
            raise ValidationError('Формат обучения потока не совпадает с форматом клиента.')
        ct = (client.group_type or '').strip()
        if ct and group.group_type != ct:
            raise ValidationError('Тип группы потока не совпадает с типом клиента.')

        return self.assign_to_group(client_id, group_id)

    @transaction.atomic
    def remove_from_group(self, client_id: str, group_id: str) -> Client:
        client = self.get_client_or_raise(client_id)
        if client.group_id and str(client.group_id) != str(group_id):
            raise ValidationError('Клиент не в этом потоке')
        client.group = None
        client.save(update_fields=['group'])
        return client

    def reset_cabinet_password(self, client_id: str) -> str:
        client = self.get_client_or_raise(client_id)
        try:
            account = client.cabinet_account
        except ClientAccount.DoesNotExist:
            raise ValidationError("У клиента нет кабинета")
        plain = _generate_cabinet_password()
        account.set_password(plain)
        return plain

    @transaction.atomic
    def re_enroll_client(self, client_id: str, data: dict, user=None) -> Client:
        from apps.groups.models import Group
        from apps.clients.bonus_service import BonusService
        from .models import ClientGroupHistory

        client = self.get_client_or_raise(client_id)

        if client.status == 'new':
            raise ValidationError(
                'Клиент со статусом «Новый» записывается через «Добавить в поток» без новой оплаты.'
            )

        if client.group:
            raise ValidationError(
                f'Клиент уже в Потоке #{client.group.number}. '
                'Сначала сделайте возврат или закройте поток.'
            )

        # Проверяем закрыта ли предыдущая оплата.
        # Если записи нет вообще — считаем что оплата «закрыта» (нечего закрывать).
        if client.payment_type == 'full':
            fp = FullPayment.objects.filter(client=client).order_by('-created_at').first()
            if fp and not fp.is_paid:
                raise ValidationError(
                    'Нельзя записать в новый поток — предыдущая оплата ещё не подтверждена.'
                )
        elif client.payment_type == 'installment':
            ip = InstallmentPlan.objects.filter(client=client).order_by('-created_at').first()
            if ip and not ip.is_closed:
                raise ValidationError(
                    f'Нельзя записать в новый поток — есть непогашенный остаток: {ip.remaining} сом.'
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
            group = Group.objects.get(id=group_id)
        except Group.DoesNotExist:
            raise ValidationError(f'Поток {group_id} не найден')
        if group.status == 'completed':
            raise ValidationError('Нельзя записать в завершённый поток')

        # «Повторный» только если уже есть завершённый поток в истории.
        # После возврата до первой записи в группу — истории нет, is_repeat остаётся False.
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
        client.refresh_from_db()
        return client

    @transaction.atomic
    def refund_client(self, client_id: str, user=None, retention_amount: Optional[Decimal] = None) -> dict:
        """
        Возврат средств (полный или частичный по деньгам клиенту).

        - Удаляем последний план оплаты (FullPayment или InstallmentPlan).
        - Сумма возврата клиенту = оплачено − удержание; удержание вручную (посещённые дни).
        - Все бонусы, начисленные с этой оплаты, аннулируются (баланс может стать отрицательным).
        - Клиент остаётся в базе: статус «Заморозка», от потока открепляем.
        """
        from apps.clients.bonus_service import BonusService
        from apps.payments.models import RefundLog

        if retention_amount is None:
            retention_amount = Decimal('0')
        retention_amount = retention_amount.quantize(Decimal('0.01'))
        if retention_amount < Decimal('0'):
            raise ValidationError('Сумма удержания не может быть отрицательной.')

        client = self.get_client_or_raise(client_id)
        refunded_pay_type = client.payment_type

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

        client.group = None
        client.status = 'frozen'
        client.save(update_fields=['group', 'status', 'payment_type', 'bonus_balance'])

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
