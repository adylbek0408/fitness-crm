# Generated manually for bonus accrual ↔ payment linkage (refund void logic)

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0003_refundlog'),
        ('clients', '0010_alter_client_status_add_new'),
    ]

    operations = [
        migrations.AddField(
            model_name='bonustransaction',
            name='source_full_payment',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='bonus_accrual_transactions',
                to='payments.fullpayment',
            ),
        ),
        migrations.AddField(
            model_name='bonustransaction',
            name='source_installment_plan',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='bonus_accrual_transactions',
                to='payments.installmentplan',
            ),
        ),
    ]
