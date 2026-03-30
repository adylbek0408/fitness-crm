import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0005_clientaccount_password_plain'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='BonusTransaction',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('id', models.UUIDField(
                    default=uuid.uuid4, editable=False,
                    primary_key=True, serialize=False
                )),
                ('transaction_type', models.CharField(
                    choices=[('accrual', 'Начисление'), ('redemption', 'Списание')],
                    max_length=15,
                )),
                ('amount', models.DecimalField(decimal_places=2, max_digits=12)),
                ('payment_amount', models.DecimalField(
                    blank=True, decimal_places=2, max_digits=12, null=True
                )),
                ('description', models.CharField(blank=True, max_length=255)),
                ('client', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='bonus_transactions',
                    to='clients.client',
                )),
                ('created_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='bonus_transactions',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'Бонусная операция',
                'verbose_name_plural': 'Бонусные операции',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='bonustransaction',
            index=models.Index(
                fields=['client', '-created_at'],
                name='clients_bon_client__idx',
            ),
        ),
    ]
