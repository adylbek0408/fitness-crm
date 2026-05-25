from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0028_enrollmentpayment_paid_at'),
    ]

    operations = [
        migrations.AlterField(
            model_name='client',
            name='status',
            field=models.CharField(
                choices=[
                    ('new', 'New'),
                    ('trial', 'Trial'),
                    ('active', 'Active'),
                    ('active_frozen', 'Активный+Заморозка'),
                    ('completed', 'Completed'),
                    ('expelled', 'Expelled'),
                    ('frozen', 'Frozen'),
                ],
                default='new',
                max_length=20,
            ),
        ),
    ]
