from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0017_alter_client_registered_by_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='client',
            name='telegram_link',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Ссылка на Telegram (для онлайн-клиентов); если заполнено — клиент считается как «из ТГ»',
                max_length=300,
            ),
        ),
    ]
