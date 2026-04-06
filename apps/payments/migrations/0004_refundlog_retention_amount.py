from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0003_refundlog'),
    ]

    operations = [
        migrations.AddField(
            model_name='refundlog',
            name='retention_amount',
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                max_digits=12,
                help_text='Сумма, удержанная компанией (за посещённые занятия и т.п.)',
            ),
        ),
        migrations.AddField(
            model_name='refundlog',
            name='total_paid',
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                max_digits=12,
                help_text='Полная оплаченная сумма до возврата (до удержания)',
            ),
        ),
    ]
