from django.db import migrations, models


def forwards_mixed_to_offline(apps, schema_editor):
    Group = apps.get_model('groups', 'Group')
    Group.objects.filter(training_format='mixed').update(training_format='offline')


class Migration(migrations.Migration):

    dependencies = [
        ('groups', '0003_group_deleted_at_number_char'),
    ]

    operations = [
        migrations.RunPython(forwards_mixed_to_offline, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='group',
            name='training_format',
            field=models.CharField(
                choices=[('offline', 'Offline'), ('online', 'Online')],
                default='offline',
                help_text='Формат обучения потока',
                max_length=10,
            ),
        ),
    ]
