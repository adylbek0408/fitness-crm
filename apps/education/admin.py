from django.contrib import admin

from .models import Lesson, LessonProgress, LiveStream, StreamViewer, Consultation


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ('title', 'lesson_type', 'trainer', 'is_published', 'created_at')
    list_filter = ('lesson_type', 'is_published', 'trainer')
    search_fields = ('title', 'description')
    autocomplete_fields = ('trainer',)
    filter_horizontal = ('groups',)


@admin.register(LessonProgress)
class LessonProgressAdmin(admin.ModelAdmin):
    list_display = ('client', 'lesson', 'percent_watched', 'is_completed', 'last_watched_at')
    list_filter = ('is_completed',)
    search_fields = ('client__first_name', 'client__last_name', 'lesson__title')


@admin.register(LiveStream)
class LiveStreamAdmin(admin.ModelAdmin):
    list_display = ('title', 'status', 'trainer', 'scheduled_at', 'started_at', 'ended_at')
    list_filter = ('status', 'trainer')
    search_fields = ('title',)
    filter_horizontal = ('groups',)
    readonly_fields = ('cf_input_uid', 'cf_rtmp_url', 'cf_stream_key',
                       'cf_playback_id', 'recording_uid', 'archived_lesson')


@admin.register(StreamViewer)
class StreamViewerAdmin(admin.ModelAdmin):
    list_display = ('stream', 'client', 'is_active', 'joined_at', 'last_heartbeat_at')
    list_filter = ('is_active',)


@admin.register(Consultation)
class ConsultationAdmin(admin.ModelAdmin):
    list_display = ('room_uuid', 'trainer', 'client', 'status',
                    'expires_at', 'used_count', 'max_uses')
    list_filter = ('status',)
    search_fields = ('room_uuid', 'title')
    readonly_fields = ('room_uuid',)
