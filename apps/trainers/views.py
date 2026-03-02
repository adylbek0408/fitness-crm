from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from core.permissions import IsAdmin
from .models import Trainer
from .serializers import TrainerSerializer, TrainerWriteSerializer
from .services import TrainerService


class TrainerViewSet(viewsets.ModelViewSet):
    queryset = Trainer.objects.filter(is_active=True).order_by('last_name')
    service = TrainerService()

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return TrainerWriteSerializer
        return TrainerSerializer

    def perform_create(self, serializer):
        trainer = self.service.create_trainer(serializer.validated_data)
        serializer.instance = trainer

    def perform_update(self, serializer):
        trainer = self.service.update_trainer(
            str(self.get_object().id),
            serializer.validated_data
        )
        serializer.instance = trainer

    def perform_destroy(self, instance):
        self.service.deactivate_trainer(str(instance.id))
