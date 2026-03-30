from datetime import date

from rest_framework import serializers

from .models import FullPayment, InstallmentPlan, InstallmentPayment


class FullPaymentReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = FullPayment
        fields = ['id', 'amount', 'is_paid', 'paid_at', 'receipt']


class FullPaymentReceiptSerializer(serializers.Serializer):
    receipt = serializers.ImageField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)


class FullPaymentUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = FullPayment
        fields = ['amount', 'is_paid', 'receipt']
        extra_kwargs = {'receipt': {'required': False}}


class InstallmentPaymentReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = InstallmentPayment
        fields = ['id', 'amount', 'paid_at', 'receipt', 'note']


class AddInstallmentPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    paid_at = serializers.DateField()
    note = serializers.CharField(required=False, allow_blank=True, default='')
    receipt = serializers.ImageField(required=False, allow_null=True)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Сумма должна быть больше 0")
        return value

    def validate_paid_at(self, value):
        if value > date.today():
            raise serializers.ValidationError("Нельзя указывать будущую дату платежа")
        return value
