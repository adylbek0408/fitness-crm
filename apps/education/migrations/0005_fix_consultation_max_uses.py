"""
Fix existing consultations that have max_uses set too low (< 10).
When max_uses is 1 or 2, the consultation immediately becomes 'used'
after the first/second participant joins, and the status polling kicks
everyone out of the Jitsi room within 10 seconds.

Set all active consultations with max_uses < 10 to max_uses = 100.
"""
from django.db import migrations


def fix_low_max_uses(apps, schema_editor):
    Consultation = apps.get_model('education', 'Consultation')
    Consultation.objects.filter(
        max_uses__lt=10,
        status='active',
        deleted_at__isnull=True,
    ).update(max_uses=100)

    # Also fix 'used' consultations that became 'used' incorrectly:
    # reset them to 'active' if they haven't been explicitly stopped
    # (ended_at is null means no one pressed "Stop").
    Consultation.objects.filter(
        status='used',
        ended_at__isnull=True,
        deleted_at__isnull=True,
    ).update(status='active', max_uses=100)


class Migration(migrations.Migration):

    dependencies = [
        ('education', '0004_add_deleted_at_to_livestream_consultation'),
    ]

    operations = [
        migrations.RunPython(fix_low_max_uses, migrations.RunPython.noop),
    ]
