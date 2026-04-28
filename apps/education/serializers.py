"""
Serializers for education module. Sprint 2 fills these in for real;
this file holds basic shapes so views can import without errors.
"""
from rest_framework import serializers

from .models import Lesson, LessonProgress, LiveStream, StreamViewer, Consultation


class LessonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lesson
        fields = [
            'id', 'title', 'description', 'lesson_type',
            'duration_sec', 'thumbnail_url',
            'groups', 'subscription_tags', 'trainer',
            'is_published', 'published_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = ('id', 'created_at', 'updated_at')


class LessonAdminSerializer(LessonSerializer):
    """Admin-only: also exposes stream_uid / r2_key for diagnostics."""
    class Meta(LessonSerializer.Meta):
        fields = LessonSerializer.Meta.fields + ['stream_uid', 'r2_key', 'created_by']


class LessonProgressSerializer(serializers.ModelSerializer):
    class Meta:
        model = LessonProgress
        fields = [
            'id', 'client', 'lesson',
            'last_position_sec', 'percent_watched', 'is_completed',
            'last_watched_at',
        ]
        read_only_fields = ('id', 'last_watched_at', 'client')


class LiveStreamSerializer(serializers.ModelSerializer):
    class Meta:
        model = LiveStream
        fields = [
            'id', 'title', 'description',
            'cf_playback_id', 'recording_uid',
            'groups', 'trainer',
            'scheduled_at', 'started_at', 'ended_at', 'status',
            'archived_lesson',
            'created_at', 'updated_at',
        ]
        read_only_fields = (
            'id', 'cf_playback_id', 'recording_uid',
            'started_at', 'ended_at', 'archived_lesson',
            'created_at', 'updated_at',
        )


class LiveStreamAdminSerializer(LiveStreamSerializer):
    """Admin-only — surfaces RTMP URL and stream key for OBS."""
    class Meta(LiveStreamSerializer.Meta):
        fields = LiveStreamSerializer.Meta.fields + [
            'cf_input_uid', 'cf_rtmp_url', 'cf_stream_key',
        ]


class StreamViewerSerializer(serializers.ModelSerializer):
    client_name = serializers.SerializerMethodField()

    class Meta:
        model = StreamViewer
        fields = ['id', 'client', 'client_name', 'joined_at',
                  'last_heartbeat_at', 'left_at', 'is_active']

    def get_client_name(self, obj):
        c = obj.client
        return f"{c.first_name} {c.last_name}".strip()


class ConsultationSerializer(serializers.ModelSerializer):
    room_url = serializers.SerializerMethodField()
    is_consumable = serializers.BooleanField(read_only=True)

    class Meta:
        model = Consultation
        fields = [
            'id', 'room_uuid', 'room_url', 'title',
            'trainer', 'client',
            'expires_at', 'max_uses', 'used_count',
            'status', 'is_consumable',
            'started_at', 'ended_at', 'duration_sec',
            'created_at', 'updated_at',
        ]
        read_only_fields = (
            'id', 'room_uuid', 'used_count', 'status',
            'started_at', 'ended_at', 'duration_sec',
            'created_at', 'updated_at',
        )

    def get_room_url(self, obj):
        # Frontend route is /room/{uuid}; absolute URL is built when needed.
        return f"/room/{obj.room_uuid}"
