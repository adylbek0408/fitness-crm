from datetime import date

from rest_framework import serializers

from .models import FullPayment, InstallmentPlan, InstallmentPayment


# A receipt photo from a phone tops out around 8 MB; anything bigger is
# almost certainly a mis-upload (scanned PDF as JPG, 4K screenshot of a
# bank app, malicious giant PNG). Reject early so we don't fill the disk
# or the response cycle on a 200 MB upload.
MAX_RECEIPT_BYTES = 12 * 1024 * 1024


def _validate_receipt_size(value):
    if value and getattr(value, 'size', 0) > MAX_RECEIPT_BYTES:
        raise serializers.ValidationError(
            f'Файл слишком большой (>12 МБ). Сожмите фото чека и попробуйте снова.'
        )
    return value


class FullPaymentReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = FullPayment
        fields = ['id', 'amount', 'course_amount', 'is_paid', 'paid_at', 'receipt']


class FullPaymentReceiptSerializer(serializers.Serializer):
    receipt = serializers.ImageField(validators=[_validate_receipt_size])
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)


class FullPaymentUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = FullPayment
        fields = ['amount', 'is_paid', 'receipt']
        extra_kwargs = {'receipt': {'required': False, 'validators': [_validate_receipt_size]}}


class InstallmentPaymentReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = InstallmentPayment
        fields = ['id', 'amount', 'paid_at', 'receipt', 'note']


class AddInstallmentPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    paid_at = serializers.DateField()
    note = serializers.CharField(required=False, allow_blank=True, default='')
    receipt = serializers.ImageField(
        required=False, allow_null=True, validators=[_validate_receipt_size],
    )

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Сумма должна быть больше 0")
        return value

    def validate_paid_at(self, value):
        if value > date.today():
            raise serializers.ValidationError("Нельзя указывать будущую дату платежа")
        return value
