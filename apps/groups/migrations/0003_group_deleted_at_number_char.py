# Generated manually

from django.db import migrations, models


def copy_group_numbers(apps, schema_editor):
    Group = apps.get_model('groups', 'Group')
    for g in Group.objects.all():
        n = getattr(g, 'number_int', None)
        if n is not None:
            g.number = str(n)
            g.save(update_fields=['number'])


class Migration(migrations.Migration):

    dependencies = [
        ('groups', '0002_group_training_format'),
    ]

    operations = [
        migrations.AddField(
            model_name='group',
            name='deleted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RenameField(
            model_name='group',
            old_name='number',
            new_name='number_int',
        ),
        migrations.AddField(
            model_name='group',
            name='number',
            field=models.CharField(default='', help_text='Номер группы (буквы и цифры)', max_length=32),
            preserve_default=False,
        ),
        migrations.RunPython(copy_group_numbers, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='group',
            name='number_int',
        ),
        migrations.AlterField(
            model_name='group',
            name='number',
            field=models.CharField(help_text='Номер группы (буквы и цифры)', max_length=32, unique=True),
        ),
        migrations.AlterModelOptions(
            name='group',
            options={
                'ordering': ['-start_date', '-created_at'],
                'verbose_name': 'Group',
                'verbose_name_plural': 'Groups',
            },
        ),
    ]
