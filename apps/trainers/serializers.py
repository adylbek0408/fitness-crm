from rest_framework import serializers

from .models import Trainer


class TrainerSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = Trainer
        fields = [
            'id', 'first_name', 'last_name', 'full_name',
            'phone', 'schedule', 'is_active', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class TrainerWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Trainer
        fields = ['first_name', 'last_name', 'phone', 'schedule']

    def validate_phone(self, value):
        if value and not value.replace('+', '').replace(' ', '').isdigit():
            raise serializers.ValidationError("Invalid phone format")
        return value
