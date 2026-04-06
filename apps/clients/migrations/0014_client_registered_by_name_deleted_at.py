# Generated manually

from django.db import migrations, models


def backfill_registered_by_name(apps, schema_editor):
    Client = apps.get_model('clients', 'Client')
    ManagerProfile = apps.get_model('accounts', 'ManagerProfile')
    User = apps.get_model('accounts', 'User')
    for c in Client.objects.filter(registered_by_id__isnull=False).iterator():
        if getattr(c, 'registered_by_name', None):
            continue
        try:
            mp = ManagerProfile.objects.get(user_id=c.registered_by_id)
            name = f'{mp.last_name} {mp.first_name}'.strip()
        except ManagerProfile.DoesNotExist:
            u = User.objects.filter(id=c.registered_by_id).first()
            name = (u.username if u else '') or ''
        if name:
            c.registered_by_name = name
            c.save(update_fields=['registered_by_name'])


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0013_alter_client_bonus_percent_free'),
        ('accounts', '0003_remove_attendance_manager_role'),
    ]

    operations = [
        migrations.AddField(
            model_name='client',
            name='registered_by_name',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='client',
            name='deleted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_registered_by_name, migrations.RunPython.noop),
    ]
