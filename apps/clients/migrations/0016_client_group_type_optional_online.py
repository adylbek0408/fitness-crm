from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0015_clientgrouphistory_group_number_char'),
    ]

    operations = [
        migrations.AlterField(
            model_name='client',
            name='group_type',
            field=models.CharField(
                blank=True,
                choices=[('1.5h', '1.5 hours'), ('2.5h', '2.5 hours')],
                default='',
                help_text='Для офлайн обязателен; для онлайн можно не указывать',
                max_length=10,
            ),
        ),
    ]
