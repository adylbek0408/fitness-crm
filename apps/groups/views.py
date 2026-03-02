from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.permissions import IsAdmin
from .models import Group
from .serializers import GroupReadSerializer, GroupWriteSerializer
from .services import GroupService
from .filters import GroupFilter


class GroupViewSet(viewsets.ModelViewSet):
    queryset = Group.objects.select_related('trainer').all()
    service = GroupService()
    filterset_class = GroupFilter
    search_fields = ['number', 'trainer__last_name']
    ordering_fields = ['number', 'start_date', 'status']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return GroupWriteSerializer
        return GroupReadSerializer

    def perform_create(self, serializer):
        data = serializer.validated_data.copy()
        if 'trainer' in data:
            data['trainer_id'] = str(data.pop('trainer').id)
        group = self.service.create_group(data)
        serializer.instance = group

    def perform_update(self, serializer):
        data = serializer.validated_data.copy()
        if 'trainer' in data:
            data['trainer_id'] = str(data.pop('trainer').id)
        group = self.service.update_group(str(self.get_object().id), data)
        serializer.instance = group

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def close(self, request, pk=None):
        group = self.service.close_group(pk)
        return Response(GroupReadSerializer(group).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def activate(self, request, pk=None):
        group = self.service.activate_group(pk)
        return Response(GroupReadSerializer(group).data)

    @action(detail=True, methods=['get'])
    def clients(self, request, pk=None):
        group = self.service.get_group_or_raise(pk)
        clients = group.clients.select_related('trainer').all()
        from apps.clients.serializers import ClientReadSerializer
        serializer = ClientReadSerializer(clients, many=True)
        return Response(serializer.data)
