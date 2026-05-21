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
        # created_at = exact upload time of the receipt (ISO datetime).
        # paid_at can be the same instant (set via mark_paid) but the UI
        # uses created_at to differentiate when several receipts are
        # uploaded back-to-back on the same day.
        fields = [
            'id', 'amount', 'course_amount', 'is_paid', 'paid_at',
            'receipt', 'created_at',
        ]


class InstallmentPaymentReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = InstallmentPayment
        # paid_at is a DateField (no time) — when the payment is dated.
        # created_at is the actual upload moment with full timestamp,
        # which is what the UI shows in "История чеков" so 3-4 receipts
        # uploaded the same day can be told apart.
        fields = ['id', 'amount', 'paid_at', 'receipt', 'note', 'created_at']


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
    google_email = serializers.SerializerMethodField()
    google_linked = serializers.SerializerMethodField()
    active_reservation = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = [
            'id', 'first_name', 'last_name', 'full_name',
            'phone', 'telegram_link', 'notes',
            'training_format', 'group_type', 'group', 'second_group', 'trainer',
            'status', 'is_repeat', 'is_trial', 'discount',
            'bonus_balance', 'bonus_percent', 'payment_type',
            'registered_at', 'registered_by_name',
            'full_payment', 'installment_plan',
            'cabinet_username', 'cabinet_password',
            'google_email', 'google_linked',
            'created_at', 'active_reservation',
        ]
        read_only_fields = ['id', 'created_at']

    def get_full_payment(self, obj):
        # .all() uses prefetch cache; sort in Python so cache isn't bypassed.
        fps = sorted(obj.full_payments.all(), key=lambda p: p.created_at, reverse=True)
        fp = fps[0] if fps else None
        if fp:
            return FullPaymentReadSerializer(fp).data
        return None

    def get_installment_plan(self, obj):
        # .all() uses prefetch cache; sort in Python so prefetch_related('payments')
        # is retained on each plan (order_by().first() would bypass the cache and
        # return a fresh object without the payments sub-prefetch).
        ips = sorted(obj.installment_plans.all(), key=lambda p: p.created_at, reverse=True)
        ip = ips[0] if ips else None
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

    def get_google_email(self, obj):
        try:
            return obj.cabinet_account.google_email or ''
        except ClientAccount.DoesNotExist:
            return ''

    def get_google_linked(self, obj):
        try:
            return bool(obj.cabinet_account.google_id)
        except ClientAccount.DoesNotExist:
            return False

    def get_active_reservation(self, obj):
        from .models import ClientGroupReservation
        res = ClientGroupReservation.objects.select_related('reserved_group').filter(
            client=obj, used_at__isnull=True,
        ).first()
        if not res:
            return None
        return {
            'id': str(res.id),
            'reserved_group_id': str(res.reserved_group_id),
            'reserved_group_number': res.reserved_group.number,
            'payment_type': res.payment_type,
            'payment_amount': str(res.payment_amount) if res.payment_amount is not None else None,
            'total_cost': str(res.total_cost) if res.total_cost is not None else None,
            'deadline': str(res.deadline) if res.deadline else None,
            'bonus_percent': res.bonus_percent,
            'note': res.note,
        }


class PaymentDataFullSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)


class PaymentDataInstallmentSerializer(serializers.Serializer):
    total_cost = serializers.DecimalField(max_digits=12, decimal_places=2)
    deadline = serializers.DateField()


class ClientCreateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    phone = serializers.CharField(max_length=20)
    telegram_link = serializers.CharField(max_length=300, required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    google_email = serializers.EmailField(required=False, allow_blank=True, default='')

    training_format = serializers.ChoiceField(choices=Client.TRAINING_FORMAT_CHOICES)
    group_type = serializers.CharField(max_length=10, allow_blank=True, required=False)
    group = serializers.PrimaryKeyRelatedField(
        queryset=Group.objects.all(), required=False, allow_null=True
    )
    trainer = serializers.PrimaryKeyRelatedField(
        queryset=Trainer.objects.filter(is_active=True), required=False, allow_null=True
    )

    is_repeat = serializers.BooleanField(default=False)
    is_trial  = serializers.BooleanField(default=False)
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
        tf = data.get('training_format')
        gt = (data.get('group_type') or '').strip()
        if tf == 'offline':
            if gt not in dict(Client.GROUP_TYPE_CHOICES):
                raise serializers.ValidationError({'group_type': 'Выберите тип группы'})
            data['group_type'] = gt
        else:
            data['group_type'] = ''

        # Пробный клиент не может быть добавлен в группу при регистрации
        if data.get('is_trial') and data.get('group'):
            raise serializers.ValidationError(
                {'group': 'Пробный клиент не добавляется в группу при регистрации.'}
            )

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
        fields = ('id', 'full_name', 'phone', 'registered_at', 'status', 'is_trial')


class ClientUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = [
            'first_name', 'last_name', 'phone', 'telegram_link', 'notes',
            'training_format', 'group_type', 'group', 'second_group', 'trainer',
            'status', 'is_repeat', 'is_trial', 'discount',
            'bonus_balance', 'bonus_percent',
        ]
