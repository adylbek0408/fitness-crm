import re
import secrets

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from core.permissions import IsAdmin
from apps.accounts.models import ManagerProfile, User
from apps.accounts.serializers import (
    CustomTokenObtainPairSerializer,
    UserSerializer,
    ManagerSerializer,
    ManagerCreateSerializer,
    ManagerUpdateSerializer,
)
from apps.clients.models import Client
from apps.clients.serializers import ClientListMinimalSerializer


UserModel = get_user_model()


def _digits_login(phone: str) -> str:
    digits = re.sub(r'\D', '', phone or '')
    if not digits:
        raise ValidationError({'phone': ['Укажите телефон — логин совпадает с номером (цифры)']})
    return digits


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class UserMeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ManagerViewSet(viewsets.ModelViewSet):
    queryset = ManagerProfile.objects.select_related('user').filter(deleted_at__isnull=True)

    def get_permissions(self):
        return [IsAdmin()]

    def get_serializer_class(self):
        if self.action == 'create':
            return ManagerCreateSerializer
        if self.action in ['update', 'partial_update']:
            return ManagerUpdateSerializer
        return ManagerSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        profile = ManagerProfile.objects.select_related('user').get(pk=serializer.instance.pk)
        return Response(ManagerSerializer(profile).data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        phone = serializer.validated_data['phone']
        base = _digits_login(phone)
        username = base
        n = 0
        while UserModel.objects.filter(username=username).exists():
            n += 1
            username = f'{base}_{n}'
        password = secrets.token_urlsafe(10)
        user = UserModel.objects.create_user(
            username=username,
            password=password,
            role='registrar',
            phone=phone,
        )
        serializer.save(user=user, password_plain=password)

    def perform_update(self, serializer):
        password = serializer.validated_data.pop('password', None)
        profile = serializer.save()
        u = profile.user
        if 'phone' in serializer.validated_data:
            new_phone = profile.phone
            base = _digits_login(new_phone)
            un = base
            n = 0
            while UserModel.objects.filter(username=un).exclude(pk=u.pk).exists():
                n += 1
                un = f'{base}_{n}'
            u.username = un
            u.phone = new_phone
            u.save(update_fields=['username', 'phone'])
        if password:
            u.set_password(password)
            profile.password_plain = password
            u.save()
            profile.save(update_fields=['password_plain'])

    def destroy(self, request, *args, **kwargs):
        profile = self.get_object()
        profile.deleted_at = timezone.now()
        profile.user.is_active = False
        profile.user.save(update_fields=['is_active'])
        profile.save(update_fields=['deleted_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='deactivate')
    def deactivate(self, request, pk=None):
        profile = self.get_object()
        profile.user.is_active = False
        profile.user.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'], url_path='clients')
    def clients(self, request, pk=None):
        profile = self.get_object()
        qs = Client.objects.filter(
            registered_by=profile.user, deleted_at__isnull=True
        ).order_by('-registered_at')
        serializer = ClientListMinimalSerializer(qs, many=True)
        return Response(serializer.data)
