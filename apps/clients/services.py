from decimal import Decimal

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

        if Client.objects.filter(phone=data.get('phone')).exists():
            raise ValidationError(f"Client with phone {data['phone']} already exists")

        if not data.get('is_repeat', False) and Decimal(str(data.get('discount', 0))) > 0:
            raise ValidationError("Discount can only be applied to repeat clients")

        # Проверка: нельзя записывать в завершённый поток
        if data.get('group_id'):
            from apps.groups.models import Group
            try:
                grp = Group.objects.get(id=data['group_id'])
                if grp.status == 'completed':
                    raise ValidationError('Нельзя записать клиента в завершённый поток')
            except Group.DoesNotExist:
                raise ValidationError(f'Поток {data["group_id"]} не найден')

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

        # Нельзя привязать к завершённому потоку
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
        client.status = new_status
        client.save(update_fields=['status'])
        return client

    @transaction.atomic
    def assign_to_group(self, client_id: str, group_id: str) -> Client:
        from apps.groups.models import Group
        client = self.get_client_or_raise(client_id)
        if client.group_id and str(client.group_id) != str(group_id):
            raise ValidationError(
                f'Клиент уже в Потоке #{client.group.number}'
            )
        try:
            group = Group.objects.get(id=group_id)
        except Group.DoesNotExist:
            raise NotFoundError(f"Group {group_id} not found")
        if group.status == 'completed':
            raise ValidationError('Нельзя добавить в завершённый поток')
        client.group = group
        client.save(update_fields=['group'])
        return client

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
        """
        Повторная запись клиента в новый поток.

        Логика бонусов:
          - Бонус СПИСЫВАЕТСЯ при записи (если есть на балансе).
          - FullPayment создаётся на сумму ПОСЛЕ вычета бонуса.
          - Новый 10% бонус начисляется при подтверждении оплаты.

        Пример: курс 11 700, бонус 1 400
          → списывается 1 400 при записи
          → FullPayment = 10 300 (клиент платит именно столько)
          → при оплате начисляется 10% от 10 300 = 1 030
        """
        from apps.groups.models import Group
        from apps.clients.bonus_service import BonusService

        client = self.get_client_or_raise(client_id)

        if client.group:
            raise ValidationError(
                f'Клиент уже в Потоке #{client.group.number}. '
                'Сначала сделайте возврат или закройте поток.'
            )

        group_id     = data.get('group_id')
        payment_type = data.get('payment_type')
        payment_data = data.get('payment_data', {})

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

        # Помечаем повторным
        if not client.is_repeat:
            client.is_repeat = True

        client.payment_type = payment_type
        bonus_svc = BonusService()

        if payment_type == 'full':
            full_price = Decimal(str(payment_data.get('amount', 0)))
            if full_price <= 0:
                raise ValidationError('Сумма оплаты должна быть положительной')

            # Списываем бонус сразу при записи — оплата создаётся на итоговую сумму
            client.refresh_from_db(fields=['bonus_balance'])
            if client.bonus_balance > Decimal('0'):
                result      = bonus_svc.apply(str(client.pk), full_price, created_by=user)
                final_price = result['final_price']
            else:
                final_price = full_price

            FullPayment.objects.create(client=client, amount=final_price)

        elif payment_type == 'installment':
            total_cost = Decimal(str(payment_data.get('total_cost', 0)))
            deadline   = payment_data.get('deadline')
            if not total_cost or not deadline:
                raise ValidationError('Для рассрочки нужны total_cost и deadline')
            if total_cost <= 0:
                raise ValidationError('Сумма рассрочки должна быть положительной')

            # Для рассрочки бонус тоже применяется к общей стоимости сразу
            client.refresh_from_db(fields=['bonus_balance'])
            if client.bonus_balance > Decimal('0'):
                result     = bonus_svc.apply(str(client.pk), total_cost, created_by=user)
                final_cost = result['final_price']
            else:
                final_cost = total_cost

            InstallmentPlan.objects.create(
                client=client,
                total_cost=final_cost,
                deadline=deadline,
            )

        # Записываем в поток + активируем
        client.group  = group
        client.status = 'active'
        client.save(update_fields=['is_repeat', 'payment_type', 'group', 'status'])
        client.refresh_from_db()

        self.logger.info(
            f'Client {client_id} re-enrolled into group {group_id}. '
            f'Bonus applied at enrollment. '
            f'Payment created with discounted amount.'
        )
        return client

    @transaction.atomic
    def refund_client(self, client_id: str, user=None) -> dict:
        """
        Возврат средств.

        Если есть история потоков (ClientGroupHistory):
          → Удаляем последнюю оплату (за текущий поток),
            убираем из потока, ставим 'expelled'.
            История прошлых потоков и их оплаты сохраняются.

        Если истории нет (новичок):
          → Полностью удаляем клиента.
        """
        from .models import ClientGroupHistory

        client = self.get_client_or_raise(client_id)
        has_history = ClientGroupHistory.objects.filter(client=client).exists()

        if has_history:
            # У клиента есть прошлые потоки — не удаляем, а отчисляем
            # Удаляем оплату текущего enrollment (по payment_type)
            if client.payment_type == 'full':
                latest_fp = FullPayment.objects.filter(client=client).order_by('-created_at').first()
                if latest_fp:
                    latest_fp.delete()
            elif client.payment_type == 'installment':
                latest_ip = InstallmentPlan.objects.filter(client=client).order_by('-created_at').first()
                if latest_ip and not latest_ip.is_closed:
                    latest_ip.payments.all().delete()
                    latest_ip.delete()

            # Восстанавливаем payment_type по оставшимся платежам
            remaining_fp = FullPayment.objects.filter(client=client).order_by('-created_at').first()
            remaining_ip = InstallmentPlan.objects.filter(client=client).order_by('-created_at').first()
            if remaining_ip and (not remaining_fp or remaining_ip.created_at > remaining_fp.created_at):
                client.payment_type = 'installment'
            elif remaining_fp:
                client.payment_type = 'full'

            client.group = None
            client.status = 'expelled'
            client.save(update_fields=['group', 'status', 'payment_type'])

            self.logger.info(f'Client {client_id} refunded (отчислен, история сохранена)')
            return {
                'action': 'expelled',
                'detail': 'Клиент отчислён, последняя оплата удалена. История прошлых потоков сохранена.',
            }
        else:
            # Новичок — удаляем полностью
            name = client.full_name
            client.delete()  # CASCADE удалит платежи, кабинет, бонусы

            self.logger.info(f'Client {client_id} ({name}) fully deleted (новичок, нет истории)')
            return {'action': 'deleted', 'detail': f'Клиент {name} полностью удалён.'}
