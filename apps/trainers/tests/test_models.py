import pytest
from apps.trainers.models import Trainer


@pytest.mark.django_db
class TestTrainerModel:
    def test_trainer_creation(self):
        trainer = Trainer.objects.create(
            first_name='John',
            last_name='Doe',
            phone='+1234567890'
        )
        assert trainer.full_name == 'Doe John'
        assert trainer.first_name == 'John'
        assert trainer.last_name == 'Doe'

    def test_trainer_str(self):
        trainer = Trainer.objects.create(first_name='Jane', last_name='Smith')
        assert str(trainer) == 'Smith Jane'
