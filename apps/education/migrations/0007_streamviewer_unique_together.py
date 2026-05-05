"""
Deduplicate StreamViewer rows and enforce one record per (stream, client).

Pre-existing data could contain multiple StreamViewer rows for the same
pair, which caused `update_or_create()` to raise MultipleObjectsReturned
under load (see HANDOFF 2026-05-04). Cabinet views were patched to use
filter().update()+first() as a workaround; this migration removes the
underlying cause.
"""
from django.db import migrations, models


def dedupe_stream_viewers(apps, schema_editor):
    StreamViewer = apps.get_model('education', 'StreamViewer')

    # For each (stream, client) keep the most recently updated row, drop the rest.
    seen = {}
    to_delete = []
    qs = StreamViewer.objects.order_by('stream_id', 'client_id', '-updated_at', '-joined_at')
    for v in qs.iterator():
        key = (v.stream_id, v.client_id)
        if key in seen:
            to_delete.append(v.pk)
        else:
            seen[key] = v.pk
    if to_delete:
        StreamViewer.objects.filter(pk__in=to_delete).delete()


def noop_reverse(apps, schema_editor):
    # Cannot recover deleted duplicate rows; no-op on reverse.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('education', '0006_livestream_cf_webrtc_playback_url'),
    ]

    operations = [
        migrations.RunPython(dedupe_stream_viewers, noop_reverse),
        migrations.AlterUniqueTogether(
            name='streamviewer',
            unique_together={('stream', 'client')},
        ),
    ]
