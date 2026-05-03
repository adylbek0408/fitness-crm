"""
Education module models.

Naming and patterns follow apps/clients and apps/groups conventions:
- Inherit core.models.UUIDTimestampedModel (UUID id + created_at + updated_at).
- Soft delete via deleted_at where applicable.
- String-based FK references to avoid circular imports.
"""
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import UUIDTimestampedModel


# ---------------------------------------------------------------------------
# Lessons (video / audio)
# ---------------------------------------------------------------------------

class Lesson(UUIDTimestampedModel):
    """A recorded lesson (video stored in Cloudflare Stream, audio in R2)."""

    LESSON_TYPE_CHOICES = [
        ('video', 'Video'),
        ('audio', 'Audio'),
    ]

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    lesson_type = models.CharField(max_length=10, choices=LESSON_TYPE_CHOICES)

    # Cloudflare Stream UID for video; or R2 object key for audio.
    stream_uid = models.CharField(max_length=64, blank=True, db_index=True)
    r2_key = models.CharField(max_length=512, blank=True)

    duration_sec = models.PositiveIntegerField(default=0)
    thumbnail_url = models.URLField(blank=True)

    # Access control:
    # 1) explicit groups (M2M to existing apps.groups.Group)
    # 2) subscription tags — intersected with Group.online_subscription_tags
    groups = models.ManyToManyField(
        'groups.Group', related_name='lessons', blank=True,
    )
    subscription_tags = models.JSONField(default=list, blank=True)

    trainer = models.ForeignKey(
        'trainers.Trainer',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='lessons',
    )

    is_published = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_lessons',
    )

    class Meta:
        ordering = ['-published_at', '-created_at']
        indexes = [
            models.Index(fields=['lesson_type']),
            models.Index(fields=['is_published']),
            models.Index(fields=['trainer']),
            models.Index(fields=['deleted_at']),
        ]

    def __str__(self):
        return f"{self.title} ({self.lesson_type})"


class LessonProgress(UUIDTimestampedModel):
    """Per-student watch progress for a lesson."""

    client = models.ForeignKey(
        'clients.Client',
        on_delete=models.CASCADE,
        related_name='lesson_progress',
    )
    lesson = models.ForeignKey(
        Lesson,
        on_delete=models.CASCADE,
        related_name='progress_records',
    )

    last_position_sec = models.PositiveIntegerField(default=0)
    percent_watched = models.PositiveSmallIntegerField(default=0)
    is_completed = models.BooleanField(default=False)
    last_watched_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('client', 'lesson')]
        indexes = [
            models.Index(fields=['client', 'lesson']),
            models.Index(fields=['is_completed']),
        ]

    def __str__(self):
        return f"{self.client_id} -> {self.lesson_id} ({self.percent_watched}%)"


# ---------------------------------------------------------------------------
# Live streams (Cloudflare Stream Live Input + automatic recording)
# ---------------------------------------------------------------------------

class LiveStream(UUIDTimestampedModel):
    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('live', 'Live'),
        ('ended', 'Ended'),
        ('archived', 'Archived'),
    ]

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # Cloudflare Stream Live Input
    cf_input_uid = models.CharField(max_length=64, blank=True, db_index=True)
    cf_rtmp_url = models.CharField(max_length=512, blank=True)
    # secret — surfaces only to the streaming trainer/admin in admin UI
    cf_stream_key = models.CharField(max_length=512, blank=True)
    cf_playback_id = models.CharField(max_length=64, blank=True)
# WebRTC publish URL (browser / mobile streaming — WHIP protocol)
    cf_webrtc_url = models.CharField(max_length=512, blank=True)
    # WebRTC playback URL (WHEP protocol — for students to watch live)
    cf_webrtc_playback_url = models.CharField(max_length=512, blank=True)
    # SRT (Larix Broadcaster etc.)
    cf_srt_url = models.CharField(max_length=256, blank=True)
    cf_srt_passphrase = models.CharField(max_length=512, blank=True)
    # Recording video UID (set by Cloudflare webhook when recording is ready)
    recording_uid = models.CharField(max_length=64, blank=True)

    groups = models.ManyToManyField(
        'groups.Group', related_name='streams', blank=True,
    )
    trainer = models.ForeignKey(
        'trainers.Trainer',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='streams',
    )

    scheduled_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    status = models.CharField(
        max_length=15, choices=STATUS_CHOICES, default='scheduled',
    )

    deleted_at = models.DateTimeField(null=True, blank=True)

    # Filled by webhook: Lesson auto-created from the recording.
    archived_lesson = models.ForeignKey(
        Lesson,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='source_streams',
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_streams',
    )

    class Meta:
        ordering = ['-scheduled_at', '-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['trainer']),
            models.Index(fields=['cf_input_uid']),
        ]

    def __str__(self):
        return f"{self.title} [{self.status}]"


class StreamViewer(UUIDTimestampedModel):
    """Tracks who joined a live stream (client requirement: see all participants)."""

    stream = models.ForeignKey(
        LiveStream,
        on_delete=models.CASCADE,
        related_name='viewers',
    )
    client = models.ForeignKey(
        'clients.Client',
        on_delete=models.CASCADE,
        related_name='stream_views',
    )

    joined_at = models.DateTimeField(auto_now_add=True)
    last_heartbeat_at = models.DateTimeField(auto_now=True)
    left_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        indexes = [
            models.Index(fields=['stream', 'is_active']),
            models.Index(fields=['client']),
        ]

    def __str__(self):
        return f"{self.client_id} @ {self.stream_id}"


# ---------------------------------------------------------------------------
# 1-on-1 consultations (Jitsi self-host, link-based — no booking flow)
# ---------------------------------------------------------------------------

def default_expires_at():
    # 30 days — admins no longer pick this manually; the link should
    # stay valid long enough for a session of any length.
    return timezone.now() + timedelta(days=30)


class Consultation(UUIDTimestampedModel):
    """A link-based 1-on-1 consultation room (Jitsi).

    Trainer creates a consultation in admin UI → gets a public link
    /room/{room_uuid} → sends to student via WhatsApp. Protection is
    via expires_at + max_uses.
    """

    STATUS_CHOICES = [
        ('active', 'Active'),
        ('used', 'Used'),
        ('expired', 'Expired'),
        ('cancelled', 'Cancelled'),
    ]

    # Public-facing identifier (URL is /room/{room_uuid}).
    room_uuid = models.UUIDField(default=uuid.uuid4, unique=True, db_index=True)
    title = models.CharField(max_length=255, blank=True)

    trainer = models.ForeignKey(
        'trainers.Trainer',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='consultations',
    )
    # client may be null if the link is "open": first one to follow it joins.
    client = models.ForeignKey(
        'clients.Client',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='consultations',
    )

    expires_at = models.DateTimeField(default=default_expires_at)
    # Trainer + student may bounce in/out (network drops, refreshes,
    # mobile background pause); 100 is effectively "no limit" for a
    # single session and still bounds an accidentally leaked link.
    max_uses = models.PositiveSmallIntegerField(default=100)
    used_count = models.PositiveSmallIntegerField(default=0)

    status = models.CharField(
        max_length=15, choices=STATUS_CHOICES, default='active',
    )
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_sec = models.PositiveIntegerField(default=0)

    deleted_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_consultations',
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['expires_at']),
            models.Index(fields=['trainer']),
        ]

    def __str__(self):
        return f"Consultation {self.room_uuid}"

    @property
    def is_consumable(self) -> bool:
        if self.status != 'active':
            return False
        if self.expires_at and self.expires_at < timezone.now():
            return False
        if self.used_count >= self.max_uses:
            return False
        return True
