from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('groups', '0004_remove_mixed_training_format'),
    ]

    operations = [
        migrations.AddField(
            model_name='group',
            name='online_subscription_tags',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='Только для онлайн: подписки/тарифы (список строк), задаются вручную',
            ),
        ),
    ]
