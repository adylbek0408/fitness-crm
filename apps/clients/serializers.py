from rest_framework import serializers

from apps.groups.models import Group
from apps.groups.serializers import GroupReadSerializer
from apps.trainers.models import Trainer
from apps.trainers.serializers import TrainerSerializer
from apps.payments.models import FullPayment, InstallmentPlan, InstallmentPayment

from .models import Client, ClientAccount, ClientEnrollment, EnrollmentPayment


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
    active_reservation    = serializers.SerializerMethodField()
    parallel_enrollments  = serializers.SerializerMethodField()

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
            'created_at', 'active_reservation', 'parallel_enrollments',
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

    def get_parallel_enrollments(self, obj):
        import logging
        logger = logging.getLogger(__name__)
        try:
            qs = (
                obj.parallel_enrollments
                   .filter(is_active=True)
                   .select_related('group', 'group__trainer')
                   .prefetch_related('payments')
            )
            enrollments = list(qs)
        except Exception as exc:
            logger.error('parallel_enrollments query failed for client %s: %s', obj.pk, exc)
            return []

        result = []
        for enrollment in enrollments:
            try:
                result.append(ClientEnrollmentReadSerializer(enrollment).data)
            except Exception as exc:
                logger.error('enrollment %s serialization failed: %s', enrollment.pk, exc)
                # fallback: minimal dict so frontend can still render the block
                try:
                    g = enrollment.group
                    result.append({
                        'id': str(enrollment.id),
                        'group': str(enrollment.group_id),
                        'group_number': g.number if g else '',
                        'group_type': getattr(g, 'group_type', ''),
                        'group_training_format': getattr(g, 'training_format', 'offline'),
                        'group_status': getattr(g, 'status', ''),
                        'trainer_name': '',
                        'payment_type': enrollment.payment_type,
                        'payment_amount': str(enrollment.payment_amount or '0'),
                        'total_cost': str(enrollment.total_cost or '0'),
                        'deadline': str(enrollment.deadline) if enrollment.deadline else None,
                        'bonus_percent': enrollment.bonus_percent,
                        'is_active': enrollment.is_active,
                        'note': enrollment.note,
                        'amount_paid': '0',
                        'is_fully_paid': False,
                        'payments': [],
                        'enrolled_by_name': enrollment.enrolled_by_name,
                        'created_at': enrollment.created_at.isoformat(),
                    })
                except Exception:
                    pass
        return result

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


class EnrollmentPaymentReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = EnrollmentPayment
        fields = ['id', 'amount', 'paid_at', 'receipt', 'note', 'created_by_name', 'created_at']


class ClientEnrollmentReadSerializer(serializers.ModelSerializer):
    group_number          = serializers.CharField(source='group.number', read_only=True)
    group_type            = serializers.CharField(source='group.group_type', read_only=True)
    group_training_format = serializers.CharField(source='group.training_format', read_only=True)
    trainer_name          = serializers.SerializerMethodField()
    group_status          = serializers.CharField(source='group.status', read_only=True)
    amount_paid           = serializers.SerializerMethodField()
    is_fully_paid         = serializers.SerializerMethodField()
    payments              = serializers.SerializerMethodField()

    class Meta:
        model = ClientEnrollment
        fields = [
            'id', 'group', 'group_number', 'group_type', 'group_training_format',
            'trainer_name', 'group_status',
            'payment_type', 'payment_amount', 'total_cost', 'deadline',
            'bonus_percent', 'is_active', 'frozen', 'frozen_at', 'note',
            'amount_paid', 'is_fully_paid', 'payments',
            'enrolled_by_name', 'created_at',
        ]

    def get_trainer_name(self, obj):
        try:
            return obj.group.trainer.full_name
        except Exception:
            return ''

    def get_amount_paid(self, obj):
        return str(obj.amount_paid)

    def get_is_fully_paid(self, obj):
        return obj.is_fully_paid

    def get_payments(self, obj):
        try:
            return EnrollmentPaymentReadSerializer(obj.payments.all(), many=True).data
        except Exception:
            return []


class EnrollmentCreateSerializer(serializers.Serializer):
    group_id       = serializers.UUIDField()
    payment_type   = serializers.ChoiceField(choices=[('full', 'full'), ('installment', 'installment')])
    payment_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    total_cost     = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    deadline       = serializers.DateField(required=False, allow_null=True)
    bonus_percent  = serializers.IntegerField(default=10, min_value=0, max_value=100)
    note           = serializers.CharField(max_length=300, required=False, allow_blank=True, default='')

    def validate(self, data):
        if data['payment_type'] == 'full':
            if not data.get('payment_amount') or data['payment_amount'] <= 0:
                raise serializers.ValidationError({'payment_amount': 'Укажите сумму для полной оплаты.'})
        else:
            if not data.get('total_cost') or data['total_cost'] <= 0:
                raise serializers.ValidationError({'total_cost': 'Укажите стоимость рассрочки.'})
            if not data.get('deadline'):
                raise serializers.ValidationError({'deadline': 'Укажите дедлайн рассрочки.'})
        return data


class EnrollmentAddPaymentSerializer(serializers.Serializer):
    amount  = serializers.DecimalField(max_digits=12, decimal_places=2)
    paid_at = serializers.DateField(required=False, allow_null=True)
    receipt = serializers.ImageField(required=False, allow_null=True)
    note    = serializers.CharField(max_length=300, required=False, allow_blank=True, default='')


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
