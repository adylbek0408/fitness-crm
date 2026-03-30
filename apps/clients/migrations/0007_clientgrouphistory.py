import uuid
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0006_bonustransaction'),
        ('groups', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='ClientGroupHistory',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('id', models.UUIDField(
                    default=uuid.uuid4, editable=False,
                    primary_key=True, serialize=False
                )),
                ('group_number', models.PositiveIntegerField()),
                ('group_type', models.CharField(max_length=10)),
                ('trainer_name', models.CharField(blank=True, max_length=200)),
                ('start_date', models.DateField(blank=True, null=True)),
                ('ended_at', models.DateField(auto_now_add=True)),
                ('payment_type', models.CharField(blank=True, max_length=15)),
                ('payment_amount', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('payment_paid', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('payment_is_closed', models.BooleanField(default=False)),
                ('client', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='group_history',
                    to='clients.client',
                )),
                ('group', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='client_history',
                    to='groups.group',
                )),
            ],
            options={
                'verbose_name': 'История потока',
                'verbose_name_plural': 'История потоков',
                'ordering': ['-ended_at'],
            },
        ),
        migrations.AddIndex(
            model_name='clientgrouphistory',
            index=models.Index(
                fields=['client', '-ended_at'],
                name='clients_cgh_client__idx',
            ),
        ),
    ]
