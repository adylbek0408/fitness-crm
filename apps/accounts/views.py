from rest_framework import status, viewsets
from rest_framework.decorators import action
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
)
from apps.clients.models import Client
from apps.clients.serializers import ClientListMinimalSerializer


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class UserMeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ManagerViewSet(viewsets.ModelViewSet):
    queryset = ManagerProfile.objects.select_related('user').all()

    def get_permissions(self):
        return [IsAdmin()]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return ManagerCreateSerializer
        return ManagerSerializer

    def perform_create(self, serializer):
        username = serializer.validated_data.pop('username')
        password = serializer.validated_data.pop('password')
        user = User.objects.create_user(
            username=username,
            password=password,
            role='registrar',
        )
        serializer.save(user=user)

    @action(detail=True, methods=['post'], url_path='deactivate')
    def deactivate(self, request, pk=None):
        profile = self.get_object()
        profile.user.is_active = False
        profile.user.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'], url_path='clients')
    def clients(self, request, pk=None):
        profile = self.get_object()
        qs = Client.objects.filter(registered_by=profile.user).order_by('-registered_at')
        serializer = ClientListMinimalSerializer(qs, many=True)
        return Response(serializer.data)
