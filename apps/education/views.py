"""
Admin/staff views for the education module.

Endpoints exposed at /api/education/...
- LessonAdminViewSet — CRUD, upload-init (TUS for video / presigned R2 PUT for audio),
  finalize.
- LiveStreamAdminViewSet — CRUD, start, end, viewers.
- ConsultationAdminViewSet — CRUD, cancel. Creates produce a public room link.
- CFStreamWebhookView — receives Cloudflare Stream events; auto-archives finished
  live recordings into Lesson rows.
"""
import logging
import uuid as _uuid

from django.core.exceptions import ImproperlyConfigured
from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Consultation, Lesson, LiveStream
from .permissions import IsTeacherOrAdmin
from .serializers import (
    ConsultationSerializer,
    LessonAdminSerializer,
    LiveStreamAdminSerializer,
)
from .services import CloudflareStreamService, R2StorageService


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lessons
# ---------------------------------------------------------------------------

class LessonAdminViewSet(viewsets.ModelViewSet):
    """Admin CRUD for lessons."""

    serializer_class = LessonAdminSerializer
    permission_classes = [IsAuthenticated, IsTeacherOrAdmin]

    def get_queryset(self):
        qs = Lesson.objects.filter(deleted_at__isnull=True)
        ltype = self.request.query_params.get('type')
        if ltype in ('video', 'audio'):
            qs = qs.filter(lesson_type=ltype)
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(Q(title__icontains=search)
                           | Q(description__icontains=search))
        return qs.order_by('-created_at')

    def perform_destroy(self, instance):
        # Soft delete, follow project pattern.
        instance.deleted_at = timezone.now()
        instance.is_published = False
        instance.save(update_fields=['deleted_at', 'is_published', 'updated_at'])

    @action(detail=False, methods=['post'], url_path='upload-init')
    def upload_init(self, request):
        """Initiate an upload.

        Body:
          { "lesson_type": "video"|"audio", "title": str,
            "description": str?, "max_duration_sec": int?,
            "groups": [uuid], "subscription_tags": [str], "trainer": uuid? }

        For video: returns Cloudflare Stream TUS upload URL + video_uid.
        For audio: returns presigned R2 PUT URL + r2_key.
        Lesson row is created (unpublished) and its id is returned in both cases.
        """
        lesson_type = request.data.get('lesson_type')
        if lesson_type not in ('video', 'audio'):
            return Response(
                {'detail': "lesson_type must be 'video' or 'audio'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        title = (request.data.get('title') or '').strip()
        if not title:
            return Response({'detail': 'title is required.'},
                            status=status.HTTP_400_BAD_REQUEST)

        lesson = Lesson.objects.create(
            title=title,
            description=request.data.get('description', ''),
            lesson_type=lesson_type,
            trainer_id=request.data.get('trainer') or None,
            subscription_tags=request.data.get('subscription_tags') or [],
            created_by=request.user if request.user.is_authenticated else None,
            is_published=False,
        )
        groups = request.data.get('groups') or []
        if groups:
            lesson.groups.set(groups)

        try:
            if lesson_type == 'video':
                max_dur = int(request.data.get('max_duration_sec') or 14400)
                payload = CloudflareStreamService.create_direct_upload_url(
                    max_duration_sec=max_dur, name=title,
                )
                lesson.stream_uid = payload['video_uid']
                lesson.save(update_fields=['stream_uid', 'updated_at'])
                return Response({
                    'lesson': LessonAdminSerializer(lesson).data,
                    'upload': {
                        'kind': 'tus',
                        'url': payload['upload_url'],
                        'video_uid': payload['video_uid'],
                    },
                }, status=status.HTTP_201_CREATED)
            else:
                ext = (request.data.get('file_ext') or 'mp3').lstrip('.')
                key = f"audio/{lesson.id}.{ext}"
                content_type = 'audio/mpeg' if ext == 'mp3' else 'audio/wav'
                url = R2StorageService.create_upload_presigned_url(
                    key=key, content_type=content_type,
                )
                lesson.r2_key = key
                lesson.save(update_fields=['r2_key', 'updated_at'])
                return Response({
                    'lesson': LessonAdminSerializer(lesson).data,
                    'upload': {
                        'kind': 'r2-presigned-put',
                        'url': url,
                        'r2_key': key,
                        'content_type': content_type,
                    },
                }, status=status.HTTP_201_CREATED)
        except ImproperlyConfigured as e:
            lesson.delete()
            return Response(
                {'detail': f'External service not configured: {e}'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception as e:
            logger.exception('upload_init failed')
            lesson.delete()
            return Response({'detail': str(e)},
                            status=status.HTTP_502_BAD_GATEWAY)

    @action(detail=True, methods=['post'])
    def finalize(self, request, pk=None):
        """Mark the lesson as published.

        Optional body:
          { "duration_sec": int, "thumbnail_url": str }

        For video, duration & thumbnail typically come from the Cloudflare
        webhook later; this endpoint is what the admin clicks after they
        verify the upload completed.
        """
        lesson = self.get_object()
        duration = request.data.get('duration_sec')
        thumb = request.data.get('thumbnail_url')
        update = []
        if duration is not None:
            lesson.duration_sec = int(duration)
            update.append('duration_sec')
        if thumb:
            lesson.thumbnail_url = thumb
            update.append('thumbnail_url')
        lesson.is_published = True
        lesson.published_at = timezone.now()
        update += ['is_published', 'published_at', 'updated_at']
        lesson.save(update_fields=update)
        return Response(LessonAdminSerializer(lesson).data)


# ---------------------------------------------------------------------------
# Live streams
# ---------------------------------------------------------------------------

class LiveStreamAdminViewSet(viewsets.ModelViewSet):
    """Admin CRUD for live streams.

    On create: provisions a Cloudflare Stream Live Input (auto-recording)
    and stores RTMP url + stream key for OBS.
    """
    serializer_class = LiveStreamAdminSerializer
    permission_classes = [IsAuthenticated, IsTeacherOrAdmin]

    def get_queryset(self):
        return LiveStream.objects.all().order_by('-created_at')

    def perform_create(self, serializer):
        try:
            payload = CloudflareStreamService.create_live_input(
                name=serializer.validated_data.get('title') or 'stream',
            )
        except ImproperlyConfigured as e:
            from rest_framework.exceptions import APIException
            raise APIException(f'CF Stream not configured: {e}')
        instance = serializer.save(
            cf_input_uid=payload['uid'],
            cf_rtmp_url=payload['rtmp_url'],
            cf_stream_key=payload['stream_key'],
            cf_playback_id=payload['playback_id'],
            created_by=self.request.user if self.request.user.is_authenticated else None,
        )
        return instance

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        stream = self.get_object()
        if stream.status not in ('scheduled', 'live'):
            return Response(
                {'detail': f'Cannot start from status={stream.status}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        stream.status = 'live'
        stream.started_at = stream.started_at or timezone.now()
        stream.save(update_fields=['status', 'started_at', 'updated_at'])
        return Response(LiveStreamAdminSerializer(stream).data)

    @action(detail=True, methods=['post'])
    def end(self, request, pk=None):
        stream = self.get_object()
        if stream.status not in ('live', 'scheduled'):
            return Response(
                {'detail': f'Cannot end from status={stream.status}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        stream.status = 'ended'
        stream.ended_at = timezone.now()
        stream.save(update_fields=['status', 'ended_at', 'updated_at'])
        # Mark all viewers as left
        from .models import StreamViewer
        StreamViewer.objects.filter(stream=stream, is_active=True).update(
            is_active=False, left_at=timezone.now(),
        )
        return Response(LiveStreamAdminSerializer(stream).data)

    @action(detail=True, methods=['get'])
    def viewers(self, request, pk=None):
        from .serializers import StreamViewerSerializer
        stream = self.get_object()
        viewers = stream.viewers.filter(is_active=True).select_related('client')
        return Response(StreamViewerSerializer(viewers, many=True).data)


# ---------------------------------------------------------------------------
# Consultations
# ---------------------------------------------------------------------------

class ConsultationAdminViewSet(viewsets.ModelViewSet):
    """Admin CRUD for 1-on-1 consultation links."""
    queryset = Consultation.objects.all()
    serializer_class = ConsultationSerializer
    permission_classes = [IsAuthenticated, IsTeacherOrAdmin]

    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user if self.request.user.is_authenticated else None,
        )

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        consultation = self.get_object()
        consultation.status = 'cancelled'
        consultation.save(update_fields=['status', 'updated_at'])
        return Response(self.get_serializer(consultation).data)


# ---------------------------------------------------------------------------
# Cloudflare Stream webhook
# ---------------------------------------------------------------------------

class CFStreamWebhookView(APIView):
    """Receives Cloudflare Stream events.

    Of interest:
      - `live_input.recording.ready` — recording finished, video has a UID;
        we attach it to the LiveStream and create a Lesson archive row.
      - `video.ready` — uploaded video transcoding finished; we backfill
        duration/thumbnail on the Lesson.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        body = request.body or b''
        sig = request.META.get('HTTP_WEBHOOK_SIGNATURE', '')
        try:
            ok = CloudflareStreamService.verify_webhook_signature(body, sig)
        except ImproperlyConfigured:
            return Response({'detail': 'Webhook secret not configured.'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if not ok:
            return Response({'detail': 'Invalid signature.'},
                            status=status.HTTP_401_UNAUTHORIZED)

        try:
            payload = request.data or {}
        except Exception:
            payload = {}

        event_type = (payload.get('eventType')
                      or payload.get('event')
                      or '').lower()
        # Cloudflare's events sometimes only put info in `meta` / fields,
        # so handle two common shapes.

        # Case 1: live recording ready (preferred event for auto-archive).
        live_input_uid = (
            payload.get('liveInput')
            or payload.get('live_input')
            or (payload.get('meta') or {}).get('live_input')
            or ''
        )
        video_uid = payload.get('uid') or payload.get('video_uid') or ''
        duration = payload.get('duration') or 0
        thumbnail = payload.get('thumbnail') or ''

        # Auto-archive: if we know which live input produced this video,
        # attach the lesson to that LiveStream.
        if live_input_uid and video_uid:
            stream = LiveStream.objects.filter(
                cf_input_uid=live_input_uid,
            ).order_by('-created_at').first()
            if stream and not stream.archived_lesson_id:
                lesson = Lesson.objects.create(
                    title=f"Эфир: {stream.title}",
                    description=stream.description or '',
                    lesson_type='video',
                    stream_uid=video_uid,
                    duration_sec=int(duration or 0),
                    thumbnail_url=thumbnail or '',
                    trainer=stream.trainer,
                    is_published=True,
                    published_at=timezone.now(),
                )
                # propagate group access
                if stream.groups.exists():
                    lesson.groups.set(list(stream.groups.values_list('id', flat=True)))
                stream.archived_lesson = lesson
                stream.recording_uid = video_uid
                stream.status = 'archived'
                if not stream.ended_at:
                    stream.ended_at = timezone.now()
                stream.save(update_fields=[
                    'archived_lesson', 'recording_uid', 'status',
                    'ended_at', 'updated_at',
                ])
                return Response({'ok': True, 'archived_lesson_id': str(lesson.id)})

        # Case 2: regular uploaded video became ready — backfill metadata.
        if video_uid:
            lesson = Lesson.objects.filter(stream_uid=video_uid).first()
            if lesson:
                update = []
                if duration and not lesson.duration_sec:
                    lesson.duration_sec = int(duration)
                    update.append('duration_sec')
                if thumbnail and not lesson.thumbnail_url:
                    lesson.thumbnail_url = thumbnail
                    update.append('thumbnail_url')
                if update:
                    update.append('updated_at')
                    lesson.save(update_fields=update)
                return Response({'ok': True, 'lesson_id': str(lesson.id)})

        logger.info('CF webhook unhandled: event=%s payload_keys=%s',
                    event_type, list(payload.keys()))
        return Response({'ok': True, 'unhandled': True})
