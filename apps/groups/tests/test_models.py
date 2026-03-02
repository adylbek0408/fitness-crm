import pytest
from datetime import date

from apps.groups.models import Group
from apps.trainers.models import Trainer


@pytest.mark.django_db
class TestGroupModel:
    def test_group_creation(self):
        trainer = Trainer.objects.create(first_name='John', last_name='Doe')
        group = Group.objects.create(
            number=101,
            group_type='1.5h',
            start_date=date(2025, 3, 1),
            trainer=trainer
        )
        assert group.status == 'recruitment'
        assert group.number == 101

    def test_group_str(self):
        trainer = Trainer.objects.create(first_name='Jane', last_name='Smith')
        group = Group.objects.create(
            number=102,
            group_type='2.5h',
            start_date=date(2025, 3, 1),
            trainer=trainer,
            status='active'
        )
        assert str(group) == 'Group #102 (2.5h) — active'
