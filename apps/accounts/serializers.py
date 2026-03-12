from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.accounts.models import User, ManagerProfile
from apps.clients.models import Client


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data['role'] = self.user.role
        data['username'] = self.user.username
        return data


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'role', 'phone', 'is_active')
        read_only_fields = ('id', 'username', 'role', 'is_active')


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
