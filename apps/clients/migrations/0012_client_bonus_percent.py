from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0011_bonustransaction_payment_sources'),
    ]

    operations = [
        migrations.AddField(
            model_name='client',
            name='bonus_percent',
            field=models.PositiveSmallIntegerField(
                choices=[(5, '5%'), (10, '10%')],
                default=10,
                help_text='Процент бонуса с оплаты, задаётся при регистрации (5 или 10)',
            ),
        ),
    ]
