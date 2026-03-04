# Migrate cabinet login to phone digits (normal logins)

import re
from django.db import migrations


def phone_digits(phone):
    if not phone:
        return ''
    return re.sub(r'\D', '', str(phone))


def set_username_to_phone(apps, schema_editor):
    ClientAccount = apps.get_model('clients', 'ClientAccount')
    used = set()
    for account in ClientAccount.objects.select_related('client').all():
        client = account.client
        base = phone_digits(client.phone)
        if not base:
            continue
        username = base
        counter = 0
        while username in used or (username != account.username and ClientAccount.objects.filter(username=username).exclude(pk=account.pk).exists()):
            counter += 1
            username = f"{base}_{counter}"
        used.add(username)
        account.username = username
        account.save(update_fields=['username'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('clients', '0002_add_client_account_bonus_remove_middle_name'),
    ]

    operations = [
        migrations.RunPython(set_username_to_phone, noop),
    ]
