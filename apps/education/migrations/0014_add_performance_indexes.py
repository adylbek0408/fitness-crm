from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('education', '0013_add_text_lesson_type'),
    ]

    operations = [
        # LessonProgress: analytics endpoint filters on (client, last_watched_at)
        # and lesson detail filters on (lesson, is_completed)
        migrations.AddIndex(
            model_name='lessonprogress',
            index=models.Index(
                fields=['client', 'last_watched_at'],
                name='educ_lp_client_lwat_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='lessonprogress',
            index=models.Index(
                fields=['lesson', 'is_completed'],
                name='educ_lp_lesson_comp_idx',
            ),
        ),
        # StreamViewer: stale-viewer cleanup runs every 8s and filters on
        # (stream, is_active, last_heartbeat_at)
        migrations.AddIndex(
            model_name='streamviewer',
            index=models.Index(
                fields=['stream', 'is_active', 'last_heartbeat_at'],
                name='educ_sv_stream_active_hb_idx',
            ),
        ),
    ]
