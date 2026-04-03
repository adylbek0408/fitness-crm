from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0002_payment_fk'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='RefundLog',
            fields=[
                ('id', models.UUIDField(primary_key=True, serialize=False, editable=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('client_name', models.CharField(max_length=200)),
                ('client_id', models.CharField(blank=True, db_index=True, max_length=36)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=12)),
                ('payment_type', models.CharField(
                    blank=True,
                    choices=[('full', 'Полная оплата'), ('installment', 'Рассрочка')],
                    max_length=15,
                )),
                ('note', models.CharField(blank=True, max_length=500)),
                ('created_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='refund_logs',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'Возврат средств',
                'verbose_name_plural': 'Возвраты средств',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='refundlog',
            index=models.Index(fields=['-created_at'], name='payments_re_created_idx'),
        ),
    ]
