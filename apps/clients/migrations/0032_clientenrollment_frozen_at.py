from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0031_clientenrollment_frozen'),
    ]

    operations = [
        migrations.AddField(
            model_name='clientenrollment',
            name='frozen_at',
            field=models.DateField(blank=True, null=True),
        ),
    ]
