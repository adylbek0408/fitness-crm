import re
import secrets

from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.accounts.models import User, ManagerProfile
from apps.clients.models import Client


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        # superuser всегда считается admin, даже если поле role не выставлено
        role = 'admin' if (self.user.is_superuser or self.user.role == 'admin') else self.user.role
        data['role'] = role
        data['username'] = self.user.username
        return data


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'username', 'role', 'phone', 'is_active')
        read_only_fields = ('id', 'username', 'role', 'is_active')

    def get_role(self, obj):
        # superuser всегда отдаём как admin
        if obj.is_superuser or obj.role == 'admin':
            return 'admin'
        return obj.role


class ManagerSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    login_username = serializers.CharField(source='user.username', read_only=True)
    role = serializers.CharField(source='user.role', read_only=True)
    is_active = serializers.BooleanField(source='user.is_active', read_only=True)
    password_plain = serializers.CharField(read_only=True)
    clients_count = serializers.SerializerMethodField()

    class Meta:
        model = ManagerProfile
        fields = (
            'id',
            'user_id',
            'username',
            'login_username',
            'role',
            'is_active',
            'first_name',
            'last_name',
            'phone',
            'password_plain',
            'clients_count',
        )
        read_only_fields = ('id', 'user_id', 'username', 'login_username', 'role', 'is_active', 'password_plain')

    def get_clients_count(self, obj):
        return Client.objects.filter(registered_by=obj.user, deleted_at__isnull=True).count()


def _username_from_phone(phone: str) -> str:
    digits = re.sub(r'\D', '', phone or '')
    if not digits:
        raise serializers.ValidationError({'phone': 'Укажите телефон — по нему будет логин в систему'})
    return digits


class ManagerCreateSerializer(serializers.ModelSerializer):
    """Создание: телефон → логин (цифры), пароль генерируется автоматически."""

    class Meta:
        model = ManagerProfile
        fields = ('id', 'first_name', 'last_name', 'phone')
        read_only_fields = ('id',)

    def validate_phone(self, value):
        if not (value or '').strip():
            raise serializers.ValidationError('Телефон обязателен')
        return value.strip()


class ManagerUpdateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = ManagerProfile
        fields = ('id', 'first_name', 'last_name', 'phone', 'password')
        read_only_fields = ('id',)

    def validate_phone(self, value):
        if value is not None:
            return value.strip()
        return value
