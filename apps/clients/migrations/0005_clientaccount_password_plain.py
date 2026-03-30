from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0004_alter_client_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='clientaccount',
            name='password_plain',
            field=models.CharField(
                blank=True, default='',
                help_text='Plain password for admin visibility',
                max_length=100,
            ),
        ),
    ]
