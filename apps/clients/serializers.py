from rest_framework import serializers

from apps.groups.models import Group
from apps.groups.serializers import GroupReadSerializer
from apps.trainers.models import Trainer
from apps.trainers.serializers import TrainerSerializer
from apps.payments.models import FullPayment, InstallmentPlan, InstallmentPayment

from .models import Client


class FullPaymentReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = FullPayment
        fields = ['id', 'amount', 'is_paid', 'paid_at', 'receipt']


class InstallmentPaymentReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = InstallmentPayment
        fields = ['id', 'amount', 'paid_at', 'receipt', 'note']


class InstallmentPlanReadSerializer(serializers.ModelSerializer):
    payments = InstallmentPaymentReadSerializer(many=True, read_only=True)
    total_paid = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    remaining = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    is_closed = serializers.BooleanField(read_only=True)

    class Meta:
        model = InstallmentPlan
        fields = ['id', 'total_cost', 'deadline', 'total_paid', 'remaining', 'is_closed', 'payments']


class ClientReadSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    group = GroupReadSerializer(read_only=True)
    trainer = TrainerSerializer(read_only=True)
    full_payment = FullPaymentReadSerializer(read_only=True)
    installment_plan = InstallmentPlanReadSerializer(read_only=True)

    class Meta:
        model = Client
        fields = [
            'id', 'first_name', 'last_name', 'middle_name', 'full_name',
            'phone', 'training_format', 'group_type', 'group', 'trainer',
            'status', 'is_repeat', 'discount', 'payment_type',
            'registered_at', 'full_payment', 'installment_plan', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class PaymentDataFullSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)


class PaymentDataInstallmentSerializer(serializers.Serializer):
    total_cost = serializers.DecimalField(max_digits=12, decimal_places=2)
    deadline = serializers.DateField()


class ClientCreateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    middle_name = serializers.CharField(max_length=100, required=False, default='')
    phone = serializers.CharField(max_length=20)

    training_format = serializers.ChoiceField(choices=Client.TRAINING_FORMAT_CHOICES)
    group_type = serializers.ChoiceField(choices=Client.GROUP_TYPE_CHOICES)
    group = serializers.PrimaryKeyRelatedField(
        queryset=Group.objects.all(), required=False, allow_null=True
    )
    trainer = serializers.PrimaryKeyRelatedField(
        queryset=Trainer.objects.filter(is_active=True), required=False, allow_null=True
    )

    is_repeat = serializers.BooleanField(default=False)
    discount = serializers.DecimalField(max_digits=5, decimal_places=2, default=0)
    registered_at = serializers.DateField(required=False)

    payment_type = serializers.ChoiceField(choices=Client.PAYMENT_TYPE_CHOICES)
    payment_data = serializers.DictField()

    def validate(self, data):
        payment_type = data.get('payment_type')
        payment_data = data.get('payment_data', {})

        if payment_type == 'full':
            s = PaymentDataFullSerializer(data=payment_data)
            if not s.is_valid():
                raise serializers.ValidationError({'payment_data': s.errors})
            data['payment_data'] = s.validated_data

        elif payment_type == 'installment':
            s = PaymentDataInstallmentSerializer(data=payment_data)
            if not s.is_valid():
                raise serializers.ValidationError({'payment_data': s.errors})
            data['payment_data'] = s.validated_data

        return data


class ClientUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = [
            'first_name', 'last_name', 'middle_name', 'phone',
            'training_format', 'group_type', 'group', 'trainer',
            'status', 'is_repeat', 'discount'
        ]
