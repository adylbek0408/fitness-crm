from rest_framework import serializers

from .models import FullPayment, InstallmentPlan, InstallmentPayment


class FullPaymentReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = FullPayment
        fields = ['id', 'amount', 'is_paid', 'paid_at', 'receipt']


class FullPaymentReceiptSerializer(serializers.Serializer):
    receipt = serializers.ImageField()


class InstallmentPaymentReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = InstallmentPayment
        fields = ['id', 'amount', 'paid_at', 'receipt', 'note']


class InstallmentPaymentCreateSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    paid_at = serializers.DateField()
    receipt = serializers.ImageField(required=False, allow_null=True)
    note = serializers.CharField(max_length=255, required=False, default='')

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be positive")
        return value
