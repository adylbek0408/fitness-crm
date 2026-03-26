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
    username = serializers.CharField(source='user.username', read_only=True)
    role = serializers.CharField(source='user.role', read_only=True)
    is_active = serializers.BooleanField(source='user.is_active', read_only=True)
    clients_count = serializers.SerializerMethodField()

    class Meta:
        model = ManagerProfile
        fields = (
            'id',
            'username',
            'role',
            'is_active',
            'first_name',
            'last_name',
            'phone',
            'clients_count',
        )
        read_only_fields = ('id', 'username', 'role', 'is_active')

    def get_clients_count(self, obj):
        return Client.objects.filter(registered_by=obj.user).count()


class ManagerCreateSerializer(serializers.ModelSerializer):
    username = serializers.CharField(write_only=True)
    password = serializers.CharField(write_only=True)

    class Meta:
        model = ManagerProfile
        fields = (
            'id',
            'username',
            'password',
            'first_name',
            'last_name',
            'phone',
        )
        read_only_fields = ('id',)
