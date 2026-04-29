from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('education', '0003_update_consultation_defaults'),
    ]

    operations = [
        migrations.AddField(
            model_name='livestream',
            name='deleted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='consultation',
            name='deleted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
