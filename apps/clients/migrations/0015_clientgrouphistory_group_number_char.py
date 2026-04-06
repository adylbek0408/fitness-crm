# Generated manually

from django.db import migrations, models


def copy_hist_numbers(apps, schema_editor):
    ClientGroupHistory = apps.get_model('clients', 'ClientGroupHistory')
    for h in ClientGroupHistory.objects.all():
        n = getattr(h, 'group_number_int', None)
        if n is not None:
            h.group_number = str(n)
            h.save(update_fields=['group_number'])


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0014_client_registered_by_name_deleted_at'),
        ('groups', '0003_group_deleted_at_number_char'),
    ]

    operations = [
        migrations.RenameField(
            model_name='clientgrouphistory',
            old_name='group_number',
            new_name='group_number_int',
        ),
        migrations.AddField(
            model_name='clientgrouphistory',
            name='group_number',
            field=models.CharField(default='', max_length=32),
            preserve_default=False,
        ),
        migrations.RunPython(copy_hist_numbers, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='clientgrouphistory',
            name='group_number_int',
        ),
        migrations.AlterField(
            model_name='clientgrouphistory',
            name='group_number',
            field=models.CharField(max_length=32),
        ),
    ]
