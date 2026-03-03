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
        payment = self.service.mark_full_payment_paid(pk)
        return Response(FullPaymentReadSerializer(payment).data)

    @action(detail=True, methods=['post'], url_path='receipt', parser_classes=[MultiPartParser])
    def upload_receipt(self, request, pk=None):
        serializer = FullPaymentReceiptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payment = self.service.upload_full_payment_receipt(
            pk, serializer.validated_data['receipt']
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
        payment = self.service.add_installment_payment(str(plan.id), serializer.validated_data)
        return Response(
            InstallmentPaymentReadSerializer(payment).data,
            status=status.HTTP_201_CREATED
        )

    