import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0019_client_is_trial_status_trial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ClientStatusHistory',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('old_status', models.CharField(blank=True, default='', max_length=20)),
                ('new_status', models.CharField(max_length=20)),
                ('changed_by_name', models.CharField(
                    blank=True, default='', max_length=200,
                    help_text='ФИО изменившего статус (снимок на момент изменения)',
                )),
                ('note', models.CharField(blank=True, default='', max_length=300)),
                ('client', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='status_history',
                    to='clients.client',
                )),
                ('changed_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='client_status_changes',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'История статуса',
                'verbose_name_plural': 'История статусов',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='clientstatushistory',
            index=models.Index(
                fields=['client', '-created_at'],
                name='clients_statushistory_idx',
            ),
        ),
    ]
