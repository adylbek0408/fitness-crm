from decimal import Decimal

from django.db import transaction

from core.services import BaseService
from core.exceptions import NotFoundError, ValidationError

from .models import Client, ClientAccount
from apps.payments.models import FullPayment, InstallmentPlan


def get_repeat_client_bonus_amount():
    from core.models import SystemSetting
    try:
        s = SystemSetting.objects.get(key='repeat_client_bonus')
        return Decimal(s.value)
    except SystemSetting.DoesNotExist:
        return Decimal('800')


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

        if client.is_repeat:
            bonus = get_repeat_client_bonus_amount()
            client.bonus_balance = bonus
            client.save(update_fields=['bonus_balance'])

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

        was_repeat = client.is_repeat
        is_repeat = data.get('is_repeat', client.is_repeat)
        discount = Decimal(str(data.get('discount', client.discount)))
        if not is_repeat and discount > 0:
            raise ValidationError("Discount can only be applied to repeat clients")

        for field, value in data.items():
            setattr(client, field, value)
        client.save()

        if is_repeat and not was_repeat:
            bonus = get_repeat_client_bonus_amount()
            client.bonus_balance = (client.bonus_balance or Decimal('0')) + bonus
            client.save(update_fields=['bonus_balance'])

        return client

    def change_status(self, client_id: str, new_status: str) -> Client:
        # frozen — заморозка клиента
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
        try:
            group = Group.objects.get(id=group_id)
        except Group.DoesNotExist:
            raise NotFoundError(f"Group {group_id} not found")
        if group.status == 'completed':
            raise ValidationError("Cannot add client to a completed group")
        client.group = group
        client.save(update_fields=['group'])
        return client

    @transaction.atomic
    def remove_from_group(self, client_id: str, group_id: str) -> Client:
        client = self.get_client_or_raise(client_id)
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
