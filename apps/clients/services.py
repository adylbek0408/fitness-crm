from decimal import Decimal

from django.db import transaction

from core.services import BaseService
from core.exceptions import NotFoundError, ValidationError

from .models import Client
from apps.payments.models import FullPayment, InstallmentPlan


class ClientService(BaseService):

    def get_client_or_raise(self, client_id: str) -> Client:
        try:
            return Client.objects.select_related(
                'group', 'trainer', 'registered_by'
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

        if payment_type == 'full':
            self._create_full_payment(client, payment_data)
        elif payment_type == 'installment':
            self._create_installment_plan(client, payment_data)
        else:
            raise ValidationError(f"Invalid payment_type: {payment_type}")

        self.logger.info(f"Client created: {client.id}, payment_type: {payment_type}")
        return client

    def _create_full_payment(self, client: Client, data: dict) -> FullPayment:
        if 'amount' not in data:
            raise ValidationError("Full payment requires 'amount'")
        return FullPayment.objects.create(client=client, amount=data['amount'])

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

        for field, value in data.items():
            setattr(client, field, value)
        client.save()
        return client

    def change_status(self, client_id: str, new_status: str) -> Client:
        valid_statuses = ['active', 'completed', 'expelled']
        if new_status not in valid_statuses:
            raise ValidationError(f"Invalid status: {new_status}")
        client = self.get_client_or_raise(client_id)
        client.status = new_status
        client.save(update_fields=['status'])
        return client
