from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('groups', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='group',
            name='training_format',
            field=models.CharField(
                choices=[('offline', 'Offline'), ('online', 'Online'), ('mixed', 'Mixed')],
                default='offline',
                help_text='Формат обучения потока',
                max_length=10,
            ),
        ),
    ]
