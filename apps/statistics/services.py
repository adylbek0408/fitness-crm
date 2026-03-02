from decimal import Decimal

from django.db.models import Sum, Q
from django.db.models.functions import Coalesce

from core.services import BaseService
from apps.payments.models import FullPayment, InstallmentPlan, InstallmentPayment
from apps.clients.models import Client
from apps.groups.models import Group
from apps.attendance.models import Attendance


class StatisticsService(BaseService):

    def _build_filters(self, params: dict) -> dict:
        client_filters = Q()
        full_payment_filters = Q()
        installment_payment_filters = Q()

        if params.get('training_format'):
            client_filters &= Q(training_format=params['training_format'])

        if params.get('group_id'):
            client_filters &= Q(group_id=params['group_id'])

        if params.get('trainer_id'):
            client_filters &= Q(trainer_id=params['trainer_id'])

        if params.get('date_from'):
            full_payment_filters &= Q(paid_at__date__gte=params['date_from'])
            installment_payment_filters &= Q(paid_at__gte=params['date_from'])

        if params.get('date_to'):
            full_payment_filters &= Q(paid_at__date__lte=params['date_to'])
            installment_payment_filters &= Q(paid_at__lte=params['date_to'])

        return {
            'client': client_filters,
            'full_payment': full_payment_filters,
            'installment_payment': installment_payment_filters,
        }

    def get_dashboard(self, params: dict) -> dict:
        f = self._build_filters(params)

        client_ids = list(
            Client.objects.filter(f['client']).values_list('id', flat=True)
        )

        full_revenue = FullPayment.objects.filter(
            f['full_payment'],
            client_id__in=client_ids,
            is_paid=True
        ).aggregate(
            total=Coalesce(Sum('amount'), Decimal('0.00'))
        )['total']

        installment_revenue = InstallmentPayment.objects.filter(
            f['installment_payment'],
            plan__client_id__in=client_ids
        ).aggregate(
            total=Coalesce(Sum('amount'), Decimal('0.00'))
        )['total']

        total_revenue = full_revenue + installment_revenue

        online_client_ids = list(
            Client.objects.filter(
                f['client'], training_format='online'
            ).values_list('id', flat=True)
        )
        offline_client_ids = list(
            Client.objects.filter(
                f['client'], training_format='offline'
            ).values_list('id', flat=True)
        )

        online_revenue = self._calc_revenue_for_clients(online_client_ids, f)
        offline_revenue = self._calc_revenue_for_clients(offline_client_ids, f)

        closed_full_payments = FullPayment.objects.filter(
            client_id__in=client_ids, is_paid=True
        ).count()

        closed_installment_plans = 0
        for plan in InstallmentPlan.objects.filter(
            client_id__in=client_ids
        ).prefetch_related('payments'):
            if plan.is_closed:
                closed_installment_plans += 1

        total_installment_plans = InstallmentPlan.objects.filter(
            client_id__in=client_ids
        ).count()
        partial_plans = total_installment_plans - closed_installment_plans

        total_absences_qs = Attendance.objects.filter(
            client_id__in=client_ids,
            is_absent=True
        )
        if params.get('date_from'):
            total_absences_qs = total_absences_qs.filter(
                lesson_date__gte=params['date_from']
            )
        if params.get('date_to'):
            total_absences_qs = total_absences_qs.filter(
                lesson_date__lte=params['date_to']
            )
        total_absences = total_absences_qs.count()

        active_groups = Group.objects.filter(status='active')
        if params.get('trainer_id'):
            active_groups = active_groups.filter(trainer_id=params['trainer_id'])
        active_groups_count = active_groups.count()

        completed_clients = Client.objects.filter(
            f['client'], status='completed'
        ).count()

        active_clients = Client.objects.filter(
            f['client'], status='active'
        ).count()

        return {
            'total_revenue': total_revenue,
            'full_payment_revenue': full_revenue,
            'installment_revenue': installment_revenue,
            'online_revenue': online_revenue,
            'offline_revenue': offline_revenue,
            'closed_full_payments': closed_full_payments,
            'closed_installment_plans': closed_installment_plans,
            'partial_installment_plans': partial_plans,
            'total_absences': total_absences,
            'active_groups_count': active_groups_count,
            'completed_clients': completed_clients,
            'active_clients': active_clients,
        }

    def _calc_revenue_for_clients(
        self, client_ids: list, filters: dict
    ) -> Decimal:
        if not client_ids:
            return Decimal('0.00')

        full = FullPayment.objects.filter(
            filters['full_payment'],
            client_id__in=client_ids,
            is_paid=True
        ).aggregate(
            total=Coalesce(Sum('amount'), Decimal('0.00'))
        )['total']

        installment = InstallmentPayment.objects.filter(
            filters['installment_payment'],
            plan__client_id__in=client_ids
        ).aggregate(
            total=Coalesce(Sum('amount'), Decimal('0.00'))
        )['total']

        return full + installment

    def get_revenue_by_group(self, params: dict) -> list:
        f = self._build_filters(params)
        groups = Group.objects.all()
        if params.get('trainer_id'):
            groups = groups.filter(trainer_id=params['trainer_id'])

        result = []
        for group in groups.select_related('trainer'):
            client_ids = list(
                Client.objects.filter(group=group).values_list('id', flat=True)
            )
            revenue = self._calc_revenue_for_clients(client_ids, f)
            result.append({
                'group_id': group.id,
                'group_number': group.number,
                'group_type': group.group_type,
                'trainer': group.trainer.full_name if group.trainer else None,
                'status': group.status,
                'revenue': revenue,
                'client_count': len(client_ids),
            })

        result.sort(key=lambda x: x['revenue'], reverse=True)
        return result

    def get_revenue_by_trainer(self, params: dict) -> list:
        from apps.trainers.models import Trainer

        f = self._build_filters(params)
        trainers = Trainer.objects.filter(is_active=True)

        result = []
        for trainer in trainers:
            client_ids = list(
                Client.objects.filter(trainer=trainer).values_list('id', flat=True)
            )
            revenue = self._calc_revenue_for_clients(client_ids, f)
            result.append({
                'trainer_id': trainer.id,
                'trainer_name': trainer.full_name,
                'revenue': revenue,
                'client_count': len(client_ids),
            })

        result.sort(key=lambda x: x['revenue'], reverse=True)
        return result
