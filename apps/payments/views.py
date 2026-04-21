from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, JSONParser, FormParser
from rest_framework.response import Response

from core.permissions import IsAdminOrRegistrar
from .models import FullPayment, InstallmentPlan
from .serializers import (
    FullPaymentReadSerializer,
    FullPaymentReceiptSerializer,
    InstallmentPaymentReadSerializer,
    AddInstallmentPaymentSerializer,
)
from .services import PaymentService


class FullPaymentViewSet(viewsets.GenericViewSet):
    queryset = FullPayment.objects.all()
    service = PaymentService()
    permission_classes = [IsAdminOrRegistrar]
    lookup_value_regex = r'[0-9a-f-]{36}'

    @action(detail=True, methods=['post'], url_path='pay')
    def mark_paid(self, request, pk=None):
        payment = self.service.mark_full_payment_paid(pk, user=request.user)
        return Response(FullPaymentReadSerializer(payment).data)

    @action(detail=True, methods=['patch'], url_path='edit')
    def edit_payment(self, request, pk=None):
        """PATCH /api/payments/full/{client_id}/edit/  — исправить сумму полной оплаты."""
        payment = FullPayment.objects.filter(client_id=pk).order_by('-created_at').first()
        if not payment:
            from rest_framework.exceptions import NotFound
            raise NotFound('Оплата не найдена')
        new_amount_raw = request.data.get('amount')
        if new_amount_raw is None:
            return Response({'detail': 'amount обязателен'}, status=status.HTTP_400_BAD_REQUEST)
        from decimal import Decimal, InvalidOperation
        try:
            new_amount = Decimal(str(new_amount_raw))
        except InvalidOperation:
            return Response({'detail': 'Некорректная сумма'}, status=status.HTTP_400_BAD_REQUEST)
        if new_amount <= 0:
            return Response({'detail': 'Сумма должна быть больше 0'}, status=status.HTTP_400_BAD_REQUEST)
        payment.amount = new_amount
        payment.course_amount = new_amount
        payment.save(update_fields=['amount', 'course_amount'])
        return Response(FullPaymentReadSerializer(payment).data)

    @action(detail=True, methods=['post'], url_path='receipt',
            parser_classes=[MultiPartParser])
    def upload_receipt(self, request, pk=None):
        serializer = FullPaymentReceiptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        payment = self.service.upload_full_payment_receipt(
            pk,
            receipt_file=data['receipt'],
            amount=data.get('amount'),
            user=request.user,
        )
        return Response(FullPaymentReadSerializer(payment).data)


class InstallmentPlanViewSet(viewsets.GenericViewSet):
    queryset = InstallmentPlan.objects.all()
    service = PaymentService()
    permission_classes = [IsAdminOrRegistrar]
    lookup_value_regex = r'[0-9a-f-]{36}'

    @action(detail=True, methods=['get'], url_path='summary')
    def summary(self, request, pk=None):
        data = self.service.get_installment_plan_with_summary(pk)
        return Response({
            'total_cost': str(data['total_cost']),
            'total_paid': str(data['total_paid']),
            'remaining': str(data['remaining']),
            'is_closed': data['is_closed'],
            'payments': InstallmentPaymentReadSerializer(
                data['payments'], many=True
            ).data,
        })

    @action(
        detail=True,
        methods=['post'],
        url_path='payments',
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def add_payment(self, request, pk=None):
        try:
            plan = InstallmentPlan.objects.get(id=pk)
        except InstallmentPlan.DoesNotExist:
            from core.exceptions import NotFoundError
            raise NotFoundError(f"InstallmentPlan {pk} not found")
        serializer = AddInstallmentPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payment = self.service.add_installment_payment(
            str(plan.id),
            serializer.validated_data,
            user=request.user,
        )
        return Response(
            InstallmentPaymentReadSerializer(payment).data,
            status=status.HTTP_201_CREATED
        )
