from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.permissions import IsAdmin
from .serializers import (
    StatisticsFilterSerializer,
    DashboardSerializer,
    GroupRevenueSerializer,
    TrainerRevenueSerializer,
)
from .services import StatisticsService


class StatisticsViewSet(viewsets.GenericViewSet):
    service = StatisticsService()
    permission_classes = [IsAdmin]

    def _get_params(self, request) -> dict:
        serializer = StatisticsFilterSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data.copy()
        if 'group_id' in data and data['group_id'] is not None:
            data['group_id'] = str(data['group_id'])
        if 'trainer_id' in data and data['trainer_id'] is not None:
            data['trainer_id'] = str(data['trainer_id'])
        return data

    @action(detail=False, methods=['get'], url_path='dashboard')
    def dashboard(self, request):
        params = self._get_params(request)
        data = self.service.get_dashboard(params)
        serializer = DashboardSerializer(instance=data)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='by-group')
    def by_group(self, request):
        params = self._get_params(request)
        data = self.service.get_revenue_by_group(params)
        serializer = GroupRevenueSerializer(instance=data, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='by-trainer')
    def by_trainer(self, request):
        params = self._get_params(request)
        data = self.service.get_revenue_by_trainer(params)
        serializer = TrainerRevenueSerializer(instance=data, many=True)
        return Response(serializer.data)
