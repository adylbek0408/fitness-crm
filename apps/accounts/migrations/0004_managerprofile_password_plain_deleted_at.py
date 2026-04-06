# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_remove_attendance_manager_role'),
    ]

    operations = [
        migrations.AddField(
            model_name='managerprofile',
            name='password_plain',
            field=models.CharField(blank=True, default='', max_length=128),
        ),
        migrations.AddField(
            model_name='managerprofile',
            name='deleted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
