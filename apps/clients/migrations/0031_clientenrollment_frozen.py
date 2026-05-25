from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0030_merge_0028_0029'),
    ]

    operations = [
        migrations.AddField(
            model_name='clientenrollment',
            name='frozen',
            field=models.BooleanField(default=False),
        ),
    ]
