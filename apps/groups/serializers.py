from rest_framework import serializers

from apps.trainers.serializers import TrainerSerializer
from .models import Group


class GroupReadSerializer(serializers.ModelSerializer):
    trainer      = TrainerSerializer(read_only=True)
    client_count = serializers.SerializerMethodField()

    class Meta:
        model  = Group
        fields = [
            'id', 'number', 'group_type', 'training_format',
            'start_date', 'end_date',
            'trainer', 'schedule', 'status', 'client_count', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def get_client_count(self, obj):
        return obj.clients.count()


class GroupWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Group
        fields = [
            'number', 'group_type', 'training_format',
            'start_date', 'end_date', 'trainer', 'schedule', 'status',
        ]

    def validate(self, data):
        start = data.get('start_date')
        end   = data.get('end_date')
        if start and end and end < start:
            raise serializers.ValidationError("end_date must be after start_date")
        return data
