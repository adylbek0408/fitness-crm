from core.services import BaseService
from core.exceptions import NotFoundError, ValidationError

from .models import Group


class GroupService(BaseService):

    def get_group_or_raise(self, group_id: str) -> Group:
        try:
            return Group.objects.select_related('trainer').get(id=group_id)
        except Group.DoesNotExist:
            raise NotFoundError(f"Group {group_id} not found")

    def create_group(self, data: dict) -> Group:
        if Group.objects.filter(number=data.get('number')).exists():
            raise ValidationError(f"Group with number {data['number']} already exists")
        group = Group.objects.create(**data)
        self.logger.info(f"Group created: {group.id} #{group.number}")
        return group

    def update_group(self, group_id: str, data: dict) -> Group:
        group = self.get_group_or_raise(group_id)
        if 'number' in data and data['number'] != group.number:
            if Group.objects.filter(number=data['number']).exists():
                raise ValidationError(f"Group number {data['number']} already taken")
        for field, value in data.items():
            setattr(group, field, value)
        group.save()
        return group

    def close_group(self, group_id: str) -> Group:
        group = self.get_group_or_raise(group_id)
        if group.status == 'completed':
            raise ValidationError("Group is already completed")
        group.status = 'completed'
        group.save(update_fields=['status'])
        group.clients.filter(status='active').update(status='completed')
        self.logger.info(f"Group {group_id} closed")
        return group

    def activate_group(self, group_id: str) -> Group:
        group = self.get_group_or_raise(group_id)
        if group.status != 'recruitment':
            raise ValidationError("Only groups in recruitment can be activated")
        group.status = 'active'
        group.save(update_fields=['status'])
        return group
