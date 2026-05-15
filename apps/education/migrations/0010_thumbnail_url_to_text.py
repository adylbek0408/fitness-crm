from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('education', '0009_webrtc_signaling'),
    ]

    operations = [
        migrations.AlterField(
            model_name='lesson',
            name='thumbnail_url',
            field=models.TextField(blank=True),
        ),
    ]
