# First migration for core (concrete model SystemSetting)

from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='SystemSetting',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(max_length=100, unique=True)),
                ('value', models.CharField(max_length=255)),
                ('description', models.CharField(blank=True, max_length=255)),
            ],
            options={
                'verbose_name': 'System Setting',
                'verbose_name_plural': 'System Settings',
            },
        ),
    ]
