from rest_framework import serializers

from apps.groups.models import Group
from apps.groups.serializers import GroupReadSerializer
from apps.trainers.models import Trainer
from apps.trainers.serializers import TrainerSerializer
from apps.payments.models import FullPayment, InstallmentPlan, InstallmentPayment

from .models import Client, ClientAccount


class FullPaymentReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = FullPayment
        fields = ['id', 'amount', 'course_amount', 'is_paid', 'paid_at', 'receipt']


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
    full_payment = serializers.SerializerMethodField()
    installment_plan = serializers.SerializerMethodField()
    registered_by_name = serializers.SerializerMethodField()
    cabinet_username = serializers.SerializerMethodField()
    cabinet_password = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = [
            'id', 'first_name', 'last_name', 'full_name',
            'phone', 'training_format', 'group_type', 'group', 'trainer',
            'status', 'is_repeat', 'discount', 'bonus_balance', 'bonus_percent', 'payment_type',
            'registered_at', 'registered_by_name',
            'full_payment', 'installment_plan',
            'cabinet_username', 'cabinet_password', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_full_payment(self, obj):
        # Согласовано с PaymentService: последняя запись (повторные клиенты имеют несколько FP)
        fp = obj.full_payments.order_by('-created_at').first()
        if fp:
            return FullPaymentReadSerializer(fp).data
        return None

    def get_installment_plan(self, obj):
        ip = obj.installment_plans.order_by('-created_at').first()
        if ip:
            return InstallmentPlanReadSerializer(ip).data
        return None

    def get_registered_by_name(self, obj):
        if getattr(obj, 'registered_by_name', None):
            return obj.registered_by_name
        if obj.registered_by_id:
            return obj.registered_by.username
        return ''

    def get_cabinet_username(self, obj):
        try:
            return obj.cabinet_account.username
        except ClientAccount.DoesNotExist:
            return None

    def get_cabinet_password(self, obj):
        try:
            return obj.cabinet_account.password_plain or None
        except ClientAccount.DoesNotExist:
            return None


class PaymentDataFullSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)


class PaymentDataInstallmentSerializer(serializers.Serializer):
    total_cost = serializers.DecimalField(max_digits=12, decimal_places=2)
    deadline = serializers.DateField()


class ClientCreateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
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

    bonus_percent = serializers.IntegerField(default=10, required=False)

    payment_type = serializers.ChoiceField(choices=Client.PAYMENT_TYPE_CHOICES)
    payment_data = serializers.DictField()

    def validate_bonus_percent(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError('Процент бонуса должен быть от 0 до 100.')
        return value

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


class ClientListMinimalSerializer(serializers.ModelSerializer):
    """Minimal client fields for manager's clients list."""
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = Client
        fields = ('id', 'full_name', 'phone', 'registered_at', 'status')


class ClientUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = [
            'first_name', 'last_name', 'phone',
            'training_format', 'group_type', 'group', 'trainer',
            'status', 'is_repeat', 'discount', 'bonus_balance', 'bonus_percent',
        ]
