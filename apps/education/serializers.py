"""
Serializers for education module. Sprint 2 fills these in for real;
this file holds basic shapes so views can import without errors.
"""
from rest_framework import serializers

from .models import (
    Consultation, Lesson, LessonProgress, LiveStream,
    StreamChatMessage, StreamGuest, StreamViewer,
)


class LessonSerializer(serializers.ModelSerializer):
    """
    thumbnail_url logic (priority order):
    1. If stored thumbnail is a permanent public URL → return as-is.
    2. If stored thumbnail looks like an expired presigned URL (contains
       X-Amz-Expires) → regenerate fresh presigned URL from the standard
       key  thumbnails/{lesson.id}.jpg  or use R2_PUBLIC_URL if set.
    3. If no stored thumbnail but lesson has a CF Stream UID → derive
       thumbnail from CF Stream CDN (always public, no expiry).
    4. Else return ''.
    """
    thumbnail_url = serializers.SerializerMethodField()

    def get_thumbnail_url(self, obj):
        from django.conf import settings as dj_settings
        from django.core.cache import cache

        stored = obj.thumbnail_url or ''

        if stored:
            # Detect presigned (expiring) R2 URL — regenerate with caching.
            if 'X-Amz-Expires' in stored or 'X-Amz-Signature' in stored:
                key = f'thumbnails/{obj.id}.jpg'
                pub = (getattr(dj_settings, 'R2_PUBLIC_URL', '') or '').rstrip('/')
                if pub:
                    return f'{pub}/{key}'
                # Cache presigned URL for 6 h — avoids one boto3 call per list item per request.
                cache_key = f'edu_thumb_{obj.id}'
                cached = cache.get(cache_key)
                if cached:
                    return cached
                try:
                    from .services import R2StorageService
                    url = R2StorageService.create_download_presigned_url(
                        key=key, ttl_seconds=7 * 24 * 3600,
                    )
                    cache.set(cache_key, url, 6 * 3600)
                    return url
                except Exception:
                    pass
            # Permanent URL (CF CDN, R2 public, custom domain) — return directly.
            return stored

        # No stored thumbnail — auto-derive from CF Stream CDN.
        if obj.lesson_type == 'video' and obj.stream_uid:
            sub = getattr(dj_settings, 'CF_STREAM_CUSTOMER', '') or ''
            if sub:
                return (
                    f'https://{sub}.cloudflarestream.com'
                    f'/{obj.stream_uid}/thumbnails/thumbnail.jpg'
                )

        return ''

    class Meta:
        model = Lesson
        fields = [
            'id', 'title', 'description', 'lesson_type', 'content',
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
    cf_subdomain = serializers.SerializerMethodField()

    class Meta:
        model = LiveStream
        fields = [
            'id', 'title', 'description',
            'cf_playback_id', 'cf_webrtc_playback_url', 'recording_uid',
            'cf_subdomain',
            'groups', 'trainer',
            'scheduled_at', 'started_at', 'ended_at', 'status',
            'archived_lesson',
            'created_at', 'updated_at',
        ]
        read_only_fields = (
            'id', 'cf_playback_id', 'cf_webrtc_playback_url', 'recording_uid',
            'cf_subdomain',
            'started_at', 'ended_at', 'archived_lesson',
            'created_at', 'updated_at',
        )

    def get_cf_subdomain(self, obj):
        from django.conf import settings as dj_settings
        sub = (getattr(dj_settings, 'CF_STREAM_CUSTOMER', '') or '').strip()
        return f'{sub}.cloudflarestream.com' if sub else ''


class LiveStreamAdminSerializer(LiveStreamSerializer):
    """Admin-only — surfaces RTMP, SRT, WebRTC credentials for streaming."""
    archived_lesson_published = serializers.SerializerMethodField()
    duration_sec = serializers.SerializerMethodField()

    class Meta(LiveStreamSerializer.Meta):
        fields = LiveStreamSerializer.Meta.fields + [
            'cf_input_uid', 'cf_rtmp_url', 'cf_stream_key',
            'cf_webrtc_url', 'cf_srt_url', 'cf_srt_passphrase',
            'archived_lesson_published', 'duration_sec',
        ]

    def get_archived_lesson_published(self, obj):
        if obj.archived_lesson_id:
            return obj.archived_lesson.is_published
        return None

    def get_duration_sec(self, obj):
        if obj.started_at and obj.ended_at:
            return max(0, int((obj.ended_at - obj.started_at).total_seconds()))
        return None


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
    trainer_name = serializers.SerializerMethodField()

    class Meta:
        model = Consultation
        fields = [
            'id', 'room_uuid', 'room_url', 'title',
            'trainer', 'trainer_name', 'client',
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
        return f"/room/{obj.room_uuid}"

    def get_trainer_name(self, obj):
        if not obj.trainer:
            return None
        return f"{obj.trainer.first_name} {obj.trainer.last_name}".strip()


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------

class StreamChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = StreamChatMessage
        fields = ['id', 'sender_name', 'text', 'is_trainer', 'created_at']
        read_only_fields = ['id', 'sender_name', 'is_trainer', 'created_at']


# ---------------------------------------------------------------------------
# Guest invitation
# ---------------------------------------------------------------------------

class StreamGuestSerializer(serializers.ModelSerializer):
    client_name = serializers.SerializerMethodField()

    class Meta:
        model = StreamGuest
        fields = [
            'id', 'client', 'client_name', 'status',
            'jitsi_room', 'jitsi_token_trainer', 'created_at',
        ]

    def get_client_name(self, obj):
        c = obj.client
        return f'{c.first_name} {c.last_name}'.strip() or str(c.id)
