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
            'online_subscription_tags',
            'start_date', 'end_date',
            'trainer', 'schedule', 'status', 'client_count', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def get_client_count(self, obj):
        return obj.clients.count()


class GroupWriteSerializer(serializers.ModelSerializer):
    online_subscription_tags = serializers.ListField(
        child=serializers.CharField(max_length=80, allow_blank=False),
        required=False,
        allow_empty=True,
    )

    class Meta:
        model  = Group
        fields = [
            'number', 'group_type', 'training_format',
            'online_subscription_tags',
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
        if fmt == 'offline' and not (gt or '').strip():
            raise serializers.ValidationError({'group_type': 'Для офлайн укажите тип группы'})
        if fmt == 'online':
            data['group_type'] = (data.get('group_type') or '').strip()
            raw_tags = data.get('online_subscription_tags')
            if raw_tags is None and self.instance:
                raw_tags = self.instance.online_subscription_tags or []
            if raw_tags is None:
                raw_tags = []
            seen = set()
            cleaned = []
            for t in raw_tags:
                s = (t or '').strip()
                if not s or s in seen:
                    continue
                if len(s) > 80:
                    raise serializers.ValidationError(
                        {'online_subscription_tags': f'Строка не длиннее 80 символов: «{s[:40]}…»'}
                    )
                seen.add(s)
                cleaned.append(s)
            if len(cleaned) > 50:
                raise serializers.ValidationError({'online_subscription_tags': 'Не более 50 позиций'})
            data['online_subscription_tags'] = cleaned
        else:
            data['online_subscription_tags'] = []
        return data
