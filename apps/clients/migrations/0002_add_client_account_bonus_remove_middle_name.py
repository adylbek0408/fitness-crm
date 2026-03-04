# ClientAccount, bonus_balance, remove middle_name

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='client',
            name='bonus_balance',
            field=models.DecimalField(decimal_places=2, default=0, help_text='Client bonus balance (visible in cabinet)', max_digits=12),
        ),
        migrations.RemoveField(
            model_name='client',
            name='middle_name',
        ),
        migrations.CreateModel(
            name='ClientAccount',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('username', models.CharField(max_length=150, unique=True)),
                ('password', models.CharField(max_length=128)),
                ('client', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='cabinet_account', to='clients.client')),
            ],
        ),
    ]
