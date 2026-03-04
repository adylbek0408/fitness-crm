from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.permissions import IsAdmin, IsAdminOrRegistrar
from core.exceptions import ValidationError
from .models import Client
from .serializers import ClientReadSerializer, ClientCreateSerializer, ClientUpdateSerializer
from .services import ClientService
from .filters import ClientFilter


class ClientViewSet(viewsets.ModelViewSet):
    service = ClientService()
    filterset_class = ClientFilter
    search_fields = ['first_name', 'last_name', 'phone']
    ordering_fields = ['registered_at', 'last_name', 'status']

    def get_queryset(self):
        return Client.objects.select_related(
            'group', 'trainer', 'registered_by', 'cabinet_account'
        ).prefetch_related(
            'full_payment',
            'installment_plan__payments'
        ).order_by('-registered_at')

    def get_permissions(self):
        if self.action == 'create':
            return [IsAdminOrRegistrar()]
        if self.action in ['update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == 'create':
            return ClientCreateSerializer
        if self.action in ['update', 'partial_update']:
            return ClientUpdateSerializer
        return ClientReadSerializer

    def create(self, request, *args, **kwargs):
        serializer = ClientCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data.copy()
        if data.get('group'):
            data['group_id'] = str(data.pop('group').id)
        else:
            data.pop('group', None)
        if data.get('trainer'):
            data['trainer_id'] = str(data.pop('trainer').id)
        else:
            data.pop('trainer', None)
        client = self.service.create_client(data, registered_by=request.user)
        out = ClientReadSerializer(client).data
        if getattr(client, '_cabinet_username_plain', None):
            out['cabinet_username'] = client._cabinet_username_plain
            out['cabinet_password'] = client._cabinet_password_plain
        return Response(out, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = ClientUpdateSerializer(
            instance, data=request.data, partial=partial
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data.copy()
        if 'group' in data:
            data['group_id'] = str(data.pop('group').id) if data['group'] else None
        if 'trainer' in data:
            data['trainer_id'] = str(data.pop('trainer').id) if data['trainer'] else None
        client = self.service.update_client(str(instance.id), data)
        return Response(ClientReadSerializer(client).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def change_status(self, request, pk=None):
        new_status = request.data.get('status')
        client = self.service.change_status(pk, new_status)
        return Response(ClientReadSerializer(client).data)

    @action(detail=True, methods=['get'])
    def attendance(self, request, pk=None):
        from apps.attendance.services import AttendanceService
        from apps.attendance.serializers import AttendanceSerializer
        records = AttendanceService().get_client_attendance(pk)
        return Response(AttendanceSerializer(records, many=True).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrRegistrar])
    def reset_cabinet_password(self, request, pk=None):
        """Generate new cabinet password, set it, return once for manager to give to client."""
        try:
            plain = self.service.reset_cabinet_password(pk)
            return Response({'password': plain})
        except ValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
