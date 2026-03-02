from core.services import BaseService
from core.exceptions import NotFoundError, ValidationError

from .models import Trainer


class TrainerService(BaseService):

    def get_trainer_or_raise(self, trainer_id: str) -> Trainer:
        try:
            return Trainer.objects.get(id=trainer_id, is_active=True)
        except Trainer.DoesNotExist:
            raise NotFoundError(f"Trainer {trainer_id} not found")

    def create_trainer(self, data: dict) -> Trainer:
        trainer = Trainer.objects.create(**data)
        self.logger.info(f"Trainer created: {trainer.id}")
        return trainer

    def update_trainer(self, trainer_id: str, data: dict) -> Trainer:
        trainer = self.get_trainer_or_raise(trainer_id)
        for field, value in data.items():
            setattr(trainer, field, value)
        trainer.save()
        return trainer

    def deactivate_trainer(self, trainer_id: str) -> Trainer:
        trainer = self.get_trainer_or_raise(trainer_id)
        if trainer.groups.filter(status__in=['recruitment', 'active']).exists():
            raise ValidationError(
                "Cannot deactivate trainer with active or recruitment groups"
            )
        trainer.is_active = False
        trainer.save(update_fields=['is_active'])
        return trainer
