# Generated manually — статус «Новый» для клиентов без потока

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0009_clientgrouphistory_receipts'),
    ]

    operations = [
        migrations.AlterField(
            model_name='client',
            name='status',
            field=models.CharField(
                choices=[
                    ('new', 'New'),
                    ('active', 'Active'),
                    ('completed', 'Completed'),
                    ('expelled', 'Expelled'),
                    ('frozen', 'Frozen'),
                ],
                default='new',
                max_length=20,
            ),
        ),
    ]
