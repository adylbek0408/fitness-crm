from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0018_client_telegram_link'),
    ]

    operations = [
        # 1. Добавляем поле is_trial
        migrations.AddField(
            model_name='client',
            name='is_trial',
            field=models.BooleanField(
                default=False,
                help_text='Пробный клиент — посещает пробное занятие; не добавляется в группу',
            ),
        ),
        # 2. Добавляем индекс на is_trial
        migrations.AddIndex(
            model_name='client',
            index=models.Index(fields=['is_trial'], name='clients_cli_is_tria_idx'),
        ),
        # 3. Меняем choices у status — добавляем 'trial'
        migrations.AlterField(
            model_name='client',
            name='status',
            field=models.CharField(
                choices=[
                    ('new', 'New'),
                    ('trial', 'Trial'),
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
