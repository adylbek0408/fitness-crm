from datetime import date

from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.permissions import IsAdmin
from .models import Group
from .serializers import GroupReadSerializer, GroupWriteSerializer
from .services import GroupService
from .filters import GroupFilter


def _auto_promote_groups():
    """Promote groups whose start_date has arrived to 'active'.

    Idempotent and cheap: filters by indexed (status, start_date), no-ops most
    of the time. Called on every list/retrieve so admins don't need to remember
    to run a cron — opening the page does the right thing.

    We deliberately DO NOT auto-close 'active' → 'completed' here, because
    close_group has side effects (creates ClientGroupHistory rows, detaches
    clients) that should be explicit.
    """
    today = date.today()
    Group.objects.filter(
        status='recruitment',
        start_date__lte=today,
        deleted_at__isnull=True,
    ).update(status='active')


class GroupViewSet(viewsets.ModelViewSet):
    queryset      = Group.objects.filter(deleted_at__isnull=True).select_related('trainer').all()
    service       = GroupService()
    filterset_class  = GroupFilter
    search_fields    = ['number', 'trainer__last_name']
    ordering_fields  = ['number', 'start_date', 'status']
    lookup_value_regex = r'[0-9a-f-]{36}'

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return GroupWriteSerializer
        return GroupReadSerializer

    def list(self, request, *args, **kwargs):
        # Auto-promote 'recruitment' → 'active' when the start date has arrived.
        # Done on every list call so admins see fresh statuses without a cron.
        _auto_promote_groups()
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        _auto_promote_groups()
        return super().retrieve(request, *args, **kwargs)

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

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.deleted_at = timezone.now()
        instance.save(update_fields=['deleted_at'])
        return Response(status=204)

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
        """
        Возвращает клиентов группы.
        Для завершённых потоков берём из ClientGroupHistory.
        """
        group = self.service.get_group_or_raise(pk)
        from apps.clients.serializers import ClientReadSerializer

        if group.status == 'completed':
            from apps.clients.models import ClientGroupHistory, Client
            client_ids = list(
                ClientGroupHistory.objects
                .filter(group=group)
                .values_list('client_id', flat=True)
            )
            clients = Client.objects.filter(id__in=client_ids).select_related('trainer')
        else:
            clients = group.clients.select_related('trainer').all()

        return Response(ClientReadSerializer(clients, many=True).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin], url_path='add-client')
    def add_client(self, request, pk=None):
        client_id = request.data.get('client_id')
        if not client_id:
            return Response({'detail': 'client_id is required'}, status=400)
        from apps.clients.services import ClientService
        client = ClientService().assign_to_group(str(client_id), str(pk))
        from apps.clients.serializers import ClientReadSerializer
        return Response(ClientReadSerializer(client).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin], url_path='remove-client')
    def remove_client(self, request, pk=None):
        client_id = request.data.get('client_id')
        if not client_id:
            return Response({'detail': 'client_id is required'}, status=400)
        from apps.clients.services import ClientService
        client = ClientService().remove_from_group(str(client_id), str(pk))
        from apps.clients.serializers import ClientReadSerializer
        return Response(ClientReadSerializer(client).data)

    @action(detail=False, methods=['post'], permission_classes=[IsAdmin], url_path='auto-update-status')
    def auto_update_status(self, request):
        """
        POST /api/groups/auto-update-status/
        Автоматически обновляет статусы потоков по датам:
          - recruitment → active  (если start_date <= сегодня)
          - active → completed    (если end_date < сегодня)
        При завершении статус клиентов → 'completed'.
        """
        today = date.today()
        completed  = []

        # recruitment → active.  Skip soft-deleted rows.  Use a single bulk
        # update for the activations (cheap, indexed, idempotent).  Names are
        # collected separately for the response body.
        to_activate_qs = Group.objects.filter(
            status='recruitment',
            start_date__lte=today,
            deleted_at__isnull=True,
        )
        activated = list(to_activate_qs.values_list('number', flat=True))
        to_activate_qs.update(status='active')

        # active → completed (закрываем через сервис, чтобы сохранить историю).
        # close_group has side effects (creates ClientGroupHistory rows, detaches
        # clients) so we keep the per-row loop here.  But we must skip soft-deleted
        # rows — otherwise we'd try to close a trashed group, which is incoherent.
        to_complete = Group.objects.filter(
            status='active',
            end_date__isnull=False,
            end_date__lt=today,
            deleted_at__isnull=True,
        )
        for group in to_complete:
            try:
                self.service.close_group(str(group.id))
                completed.append(group.number)
            except Exception:
                pass

        return Response({
            'activated':  activated,
            'completed':  completed,
            'today':      str(today),
            'message':    (
                f'Активировано: {len(activated)}, завершено: {len(completed)}'
                if activated or completed
                else 'Изменений нет'
            ),
        })
