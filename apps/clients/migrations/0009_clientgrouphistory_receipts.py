from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0008_rename_clients_bon_client__idx_clients_bon_client__b66680_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='clientgrouphistory',
            name='receipts',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='List of receipt objects for this group enrollment'
            ),
        ),
    ]
