from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0027_add_client_enrollment'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrollmentpayment',
            name='paid_at',
            field=models.DateField(blank=True, null=True),
        ),
    ]
