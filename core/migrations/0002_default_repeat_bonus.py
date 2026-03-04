# Data migration: default repeat_client_bonus = 800

from django.db import migrations


def create_default_repeat_bonus(apps, schema_editor):
    SystemSetting = apps.get_model('core', 'SystemSetting')
    if not SystemSetting.objects.filter(key='repeat_client_bonus').exists():
        SystemSetting.objects.create(
            key='repeat_client_bonus',
            value='800',
            description='Bonus amount (som) credited when client is marked as repeat (is_repeat=True)',
        )


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_default_repeat_bonus, reverse_noop),
    ]
