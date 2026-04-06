import re

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

    def validate_number(self, value):
        s = (value or '').strip()
        if not s:
            raise serializers.ValidationError('Укажите номер группы')
        if not re.match(r'^[\w\-А-Яа-яЁё]+$', s):
            raise serializers.ValidationError('Допустимы буквы, цифры, дефис и подчёркивание')
        return s

    def validate(self, data):
        start = data.get('start_date')
        end = data.get('end_date')
        if start and end and end < start:
            raise serializers.ValidationError('end_date must be after start_date')

        fmt = data.get('training_format')
        if fmt is None and self.instance:
            fmt = self.instance.training_format
        gt = data.get('group_type')
        if gt is None and self.instance:
            gt = self.instance.group_type

        fmt = fmt or 'offline'
        if fmt in ('offline', 'mixed') and not (gt or '').strip():
            raise serializers.ValidationError({'group_type': 'Для офлайн / смешанного формата укажите тип группы'})
        if fmt == 'online':
            data['group_type'] = (data.get('group_type') or '').strip()
        return data
