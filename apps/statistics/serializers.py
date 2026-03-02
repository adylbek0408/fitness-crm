from rest_framework import serializers


class StatisticsFilterSerializer(serializers.Serializer):
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    group_id = serializers.UUIDField(required=False)
    trainer_id = serializers.UUIDField(required=False)
    training_format = serializers.ChoiceField(
        choices=['online', 'offline'],
        required=False
    )

    def validate(self, data):
        if data.get('date_from') and data.get('date_to'):
            if data['date_from'] > data['date_to']:
                raise serializers.ValidationError(
                    "date_from must be before date_to"
                )
        return data


class DashboardSerializer(serializers.Serializer):
    total_revenue = serializers.DecimalField(max_digits=15, decimal_places=2)
    full_payment_revenue = serializers.DecimalField(max_digits=15, decimal_places=2)
    installment_revenue = serializers.DecimalField(max_digits=15, decimal_places=2)
    online_revenue = serializers.DecimalField(max_digits=15, decimal_places=2)
    offline_revenue = serializers.DecimalField(max_digits=15, decimal_places=2)
    closed_full_payments = serializers.IntegerField()
    closed_installment_plans = serializers.IntegerField()
    partial_installment_plans = serializers.IntegerField()
    total_absences = serializers.IntegerField()
    active_groups_count = serializers.IntegerField()
    completed_clients = serializers.IntegerField()
    active_clients = serializers.IntegerField()


class GroupRevenueSerializer(serializers.Serializer):
    group_id = serializers.UUIDField()
    group_number = serializers.IntegerField()
    group_type = serializers.CharField()
    trainer = serializers.CharField(allow_null=True)
    status = serializers.CharField()
    revenue = serializers.DecimalField(max_digits=15, decimal_places=2)
    client_count = serializers.IntegerField()


class TrainerRevenueSerializer(serializers.Serializer):
    trainer_id = serializers.UUIDField()
    trainer_name = serializers.CharField()
    revenue = serializers.DecimalField(max_digits=15, decimal_places=2)
    client_count = serializers.IntegerField()
