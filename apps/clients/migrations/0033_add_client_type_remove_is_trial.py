from django.db import migrations, models


def migrate_forward(apps, schema_editor):
    """
    Data migration:
      status='trial'         → status='new',    client_type='trial'
      status='frozen'        → status='active', client_type='frozen'
      status='active_frozen' → status='active', client_type='regular'
      is_trial=True (any)    → client_type='trial'
    """
    Client = apps.get_model('clients', 'Client')
    # active_frozen → active (parallel enrollment already has frozen=True)
    Client.objects.filter(status='active_frozen').update(status='active', client_type='regular')
    # frozen → active + client_type frozen
    Client.objects.filter(status='frozen').update(status='active', client_type='frozen')
    # trial → new + client_type trial
    Client.objects.filter(status='trial').update(status='new', client_type='trial')
    # Catch any is_trial=True that weren't caught by status='trial'
    Client.objects.filter(is_trial=True, client_type='regular').update(client_type='trial')


def migrate_backward(apps, schema_editor):
    Client = apps.get_model('clients', 'Client')
    Client.objects.filter(client_type='trial').update(status='trial', is_trial=True)
    Client.objects.filter(client_type='frozen').update(status='frozen')


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0032_clientenrollment_frozen_at'),
    ]

    operations = [
        # 1. Add client_type with default 'regular'
        migrations.AddField(
            model_name='client',
            name='client_type',
            field=models.CharField(
                choices=[
                    ('regular', 'Обычный'),
                    ('trial', 'Пробный'),
                    ('frozen', 'Заморозка'),
                ],
                default='regular',
                help_text='Пробный — пришёл на пробное занятие; Заморозка — обучение приостановлено',
                max_length=20,
            ),
        ),
        # 2. Migrate existing data
        migrations.RunPython(migrate_forward, migrate_backward),
        # 3. Remove is_trial index (renamed in migration 0021)
        migrations.RemoveIndex(
            model_name='client',
            name='clients_cli_is_tria_5ebcf2_idx',
        ),
        # 4. Remove is_trial field
        migrations.RemoveField(
            model_name='client',
            name='is_trial',
        ),
        # 5. Update status choices (remove trial/frozen/active_frozen)
        migrations.AlterField(
            model_name='client',
            name='status',
            field=models.CharField(
                choices=[
                    ('new', 'New'),
                    ('active', 'Active'),
                    ('completed', 'Completed'),
                    ('expelled', 'Expelled'),
                ],
                default='new',
                max_length=20,
            ),
        ),
        # 6. Add client_type index
        migrations.AddIndex(
            model_name='client',
            index=models.Index(fields=['client_type'], name='clients_client_type_idx'),
        ),
    ]
