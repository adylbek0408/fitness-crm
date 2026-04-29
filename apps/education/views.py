"""
Admin/staff views for the education module.

Endpoints exposed at /api/education/...
- LessonAdminViewSet — CRUD, upload-init (TUS for video / presigned R2 PUT for audio),
  finalize.
- LiveStreamAdminViewSet — CRUD, start, end, viewers.
- ConsultationAdminViewSet — CRUD, cancel. Creates produce a public room link.
- CFStreamWebhookView — receives Cloudflare Stream events; auto-archives finished
  live recordings into Lesson rows.
- EducationStatsView — aggregated analytics: who watched, % completion,
  inactive students.
"""
import logging
import uuid as _uuid
from datetime import timedelta

from django.core.exceptions import ImproperlyConfigured
from django.db.models import Avg, Count, Max, Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.clients.models import Client

from .models import Consultation, Lesson, LessonProgress, LiveStream
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
                file_ext = (request.data.get('file_ext') or 'mp4').lstrip('.')

                # Try CF Stream first; fall back to R2 if quota exceeded.
                cf_ok = False
                try:
                    payload = CloudflareStreamService.create_direct_upload_url(
                        max_duration_sec=max_dur, name=title,
                    )
                    lesson.stream_uid = payload['video_uid']
                    lesson.save(update_fields=['stream_uid', 'updated_at'])
                    cf_ok = True
                    return Response({
                        'lesson': LessonAdminSerializer(lesson).data,
                        'upload': {
                            'kind': 'cf-direct',
                            'url': payload['upload_url'],
                            'video_uid': payload['video_uid'],
                        },
                    }, status=status.HTTP_201_CREATED)
                except ImproperlyConfigured:
                    logger.info('CF Stream not configured — using R2 for video')
                except Exception as cf_err:
                    logger.warning('CF Stream upload init failed (%s) — falling back to R2', cf_err)

                if not cf_ok:
                    # R2 fallback: store video as plain MP4
                    r2_key = f"video/{lesson.id}.{file_ext}"
                    content_type = 'video/mp4'
                    r2_url = R2StorageService.create_upload_presigned_url(
                        key=r2_key, content_type=content_type,
                    )
                    lesson.r2_key = r2_key
                    lesson.save(update_fields=['r2_key', 'updated_at'])
                    return Response({
                        'lesson': LessonAdminSerializer(lesson).data,
                        'upload': {
                            'kind': 'r2-presigned-put',
                            'url': r2_url,
                            'r2_key': r2_key,
                            'content_type': content_type,
                        },
                    }, status=status.HTTP_201_CREATED)

            else:  # audio
                ext = (request.data.get('file_ext') or 'mp3').lstrip('.')
                key = f"audio/{lesson.id}.{ext}"
                audio_content_types = {
                    'mp3': 'audio/mpeg', 'wav': 'audio/wav',
                    'webm': 'audio/webm', 'm4a': 'audio/mp4',
                    'ogg': 'audio/ogg',
                }
                content_type = audio_content_types.get(ext, 'audio/mpeg')
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
                {'detail': f'Внешний сервис не настроен: {e}'},
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
            cf_webrtc_url=payload.get('webrtc_url', ''),
            cf_srt_url=payload.get('srt_url', ''),
            cf_srt_passphrase=payload.get('srt_passphrase', ''),
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

    @action(detail=True, methods=['post'])
    def stop(self, request, pk=None):
        """Stop a consultation and propagate to the student's room via status polling."""
        consultation = self.get_object()
        now = timezone.now()
        if consultation.started_at:
            consultation.duration_sec = max(
                0, int((now - consultation.started_at).total_seconds())
            )
        consultation.status = 'cancelled'
        consultation.ended_at = now
        consultation.save(update_fields=[
            'status', 'ended_at', 'duration_sec', 'updated_at',
        ])
        return Response(self.get_serializer(consultation).data)

    @action(detail=True, methods=['get'], url_path='join-as-trainer')
    def join_as_trainer(self, request, pk=None):
        """Return Jitsi room info for the trainer without incrementing used_count."""
        consultation = self.get_object()
        if consultation.status not in ('active',):
            return Response(
                {'valid': False, 'reason': consultation.status},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not consultation.started_at:
            consultation.started_at = timezone.now()
            consultation.save(update_fields=['started_at', 'updated_at'])

        display_name = (
            getattr(request.user, 'display_name', None)
            or request.user.username
            or 'Тренер'
        )

        from django.conf import settings as dj_settings
        from .services import JitsiService
        from django.core.exceptions import ImproperlyConfigured as IC

        domain = (getattr(dj_settings, 'JITSI_DOMAIN', '') or '').strip() or 'meet.jit.si'
        secret = (getattr(dj_settings, 'JITSI_APP_SECRET', '') or '').strip()
        token = None
        if secret and domain not in ('meet.jit.si',):
            try:
                token = JitsiService.create_room_token(
                    room=str(consultation.room_uuid),
                    display_name=display_name,
                    is_moderator=True,
                )
            except IC:
                token = None

        return Response({
            'valid': True,
            'room_name': str(consultation.room_uuid),
            'jitsi_token': token,
            'jitsi_domain': domain,
            'display_name': display_name,
        })


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


# ---------------------------------------------------------------------------
# Education analytics (Sprint 5.1)
# ---------------------------------------------------------------------------

class EducationStatsView(APIView):
    """Aggregated analytics for admins.

    GET /api/education/stats/

    Query params (optional):
      - group: UUID — restrict to one group
      - inactive_days: int (default 7) — threshold for "inactive" tab
      - lesson: UUID — drill into one lesson (returns viewers list with progress)

    Response shape:
      {
        "summary": {
          "total_lessons": int,
          "total_clients_eligible": int,
          "avg_completion_percent": float,
          "active_last_7_days": int,
          "inactive": int,
        },
        "lessons": [
          { "id", "title", "lesson_type", "groups": [str],
            "viewers_count": int, "avg_percent": float,
            "completed_count": int }
        ],
        "inactive_clients": [
          { "id", "first_name", "last_name", "phone",
            "group_name", "last_watched_at": iso|null }
        ],
        "lesson_detail"?: {
          "id", "title",
          "viewers": [
            { "client_id", "first_name", "last_name", "phone",
              "percent_watched", "last_position_sec",
              "is_completed", "last_watched_at" }
          ]
        }
      }
    """
    permission_classes = [IsAuthenticated, IsTeacherOrAdmin]

    def get(self, request):
        group_id = request.query_params.get('group') or None
        try:
            inactive_days = int(request.query_params.get('inactive_days') or 7)
        except (TypeError, ValueError):
            inactive_days = 7
        lesson_id = request.query_params.get('lesson') or None

        # Lessons in scope
        lessons_qs = Lesson.objects.filter(
            is_published=True, deleted_at__isnull=True,
        )
        if group_id:
            lessons_qs = lessons_qs.filter(groups__id=group_id).distinct()

        # Per-lesson stats
        lessons_data = []
        for l in lessons_qs.prefetch_related('groups').order_by('-published_at', '-created_at'):
            agg = LessonProgress.objects.filter(lesson=l).aggregate(
                viewers_count=Count('id'),
                avg_percent=Avg('percent_watched'),
                completed_count=Count('id', filter=Q(is_completed=True)),
            )
            lessons_data.append({
                'id': str(l.id),
                'title': l.title,
                'lesson_type': l.lesson_type,
                'duration_sec': l.duration_sec,
                'groups': [f'Группа {g.number}' for g in l.groups.all()],
                'viewers_count': agg['viewers_count'] or 0,
                'avg_percent': round(agg['avg_percent'] or 0.0, 1),
                'completed_count': agg['completed_count'] or 0,
            })

        # Eligible clients (those whose group has at least one lesson)
        clients_qs = Client.objects.filter(
            deleted_at__isnull=True, group__isnull=False,
        )
        if group_id:
            clients_qs = clients_qs.filter(group_id=group_id)

        # Last activity per client
        cutoff = timezone.now() - timedelta(days=inactive_days)
        active_count = LessonProgress.objects.filter(
            client__in=clients_qs, last_watched_at__gte=cutoff,
        ).values('client').distinct().count()

        # Inactive: clients with no activity in last N days (or never watched)
        last_activity = dict(
            LessonProgress.objects.filter(client__in=clients_qs)
            .values('client')
            .annotate(last=Max('last_watched_at'))
            .values_list('client', 'last')
        )
        inactive = []
        for client in clients_qs.select_related('group'):
            last = last_activity.get(client.id)
            if not last or last < cutoff:
                inactive.append({
                    'id': str(client.id),
                    'first_name': client.first_name,
                    'last_name': client.last_name,
                    'phone': getattr(client, 'phone', '') or '',
                    'group_name': (f'Группа {client.group.number}'
                                   if client.group_id and client.group else ''),
                    'last_watched_at': last.isoformat() if last else None,
                })

        # Drill-down for one lesson
        lesson_detail = None
        if lesson_id:
            try:
                lesson = Lesson.objects.get(pk=lesson_id, deleted_at__isnull=True)
            except Lesson.DoesNotExist:
                return Response({'detail': 'Lesson not found.'},
                                status=status.HTTP_404_NOT_FOUND)
            progress_qs = LessonProgress.objects.filter(
                lesson=lesson,
            ).select_related('client').order_by('-percent_watched', '-last_watched_at')
            lesson_detail = {
                'id': str(lesson.id),
                'title': lesson.title,
                'viewers': [
                    {
                        'client_id': str(p.client_id),
                        'first_name': p.client.first_name,
                        'last_name': p.client.last_name,
                        'phone': getattr(p.client, 'phone', '') or '',
                        'percent_watched': p.percent_watched,
                        'last_position_sec': p.last_position_sec,
                        'is_completed': p.is_completed,
                        'last_watched_at': p.last_watched_at.isoformat(),
                    }
                    for p in progress_qs
                ],
            }

        avg_completion = (
            sum(l['avg_percent'] for l in lessons_data) / len(lessons_data)
            if lessons_data else 0.0
        )

        response = {
            'summary': {
                'total_lessons': len(lessons_data),
                'total_clients_eligible': clients_qs.count(),
                'avg_completion_percent': round(avg_completion, 1),
                'active_last_7_days': active_count,
                'inactive': len(inactive),
                'inactive_days': inactive_days,
            },
            'lessons': lessons_data,
            'inactive_clients': sorted(
                inactive,
                key=lambda x: (x['last_watched_at'] or '', x['last_name']),
            ),
        }
        if lesson_detail:
            response['lesson_detail'] = lesson_detail
        return Response(response)
