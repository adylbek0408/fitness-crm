# Generated manually - remove attendance_manager role

from django.db import migrations, models


def migrate_attendance_managers_to_registrar(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    User.objects.filter(role='attendance_manager').update(role='registrar')


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_managerprofile'),
    ]

    operations = [
        migrations.RunPython(migrate_attendance_managers_to_registrar, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(
                choices=[('admin', 'Admin'), ('registrar', 'Registrar')],
                default='registrar',
                max_length=30,
            ),
        ),
    ]
