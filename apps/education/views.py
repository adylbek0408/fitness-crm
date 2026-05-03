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
        # Exclude auto-created stream recordings — those appear in the stream archive.
        qs = Lesson.objects.filter(deleted_at__isnull=True, source_streams__isnull=True)
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

    @action(detail=True, methods=['get'])
    def preview(self, request, pk=None):
        """Return a playback URL for admin preview (no DRM/watermark).

        Uses _get_any_lesson so it also works on stream-recording lessons
        (which are hidden from the default queryset).
        """
        lesson = self._get_any_lesson(pk)
        if not lesson:
            return Response({'detail': 'Not found.'},
                            status=status.HTTP_404_NOT_FOUND)
        playback_url = None
        video_kind = None
        try:
            if lesson.lesson_type == 'video' and lesson.stream_uid:
                try:
                    playback_url = CloudflareStreamService.create_signed_playback_url(
                        video_uid=lesson.stream_uid, client_id=str(request.user.pk),
                    )
                except Exception:
                    # Fallback to public HLS URL when signing not configured
                    from django.conf import settings as dj_settings
                    sub = getattr(dj_settings, 'CF_STREAM_CUSTOMER', '')
                    if sub:
                        playback_url = (
                            f'https://{sub}.cloudflarestream.com'
                            f'/{lesson.stream_uid}/manifest/video.m3u8'
                        )
                video_kind = 'hls'
            elif lesson.lesson_type == 'video' and lesson.r2_key:
                playback_url = R2StorageService.create_download_presigned_url(
                    key=lesson.r2_key,
                )
                video_kind = 'r2'
            elif lesson.lesson_type == 'audio' and lesson.r2_key:
                playback_url = R2StorageService.create_download_presigned_url(
                    key=lesson.r2_key,
                )
        except ImproperlyConfigured:
            pass
        except Exception:
            logger.exception('Admin preview URL generation failed')
        return Response({'playback_url': playback_url, 'video_kind': video_kind})

    def _get_any_lesson(self, pk):
        """Fetch a lesson by pk including stream-recording lessons.

        The default get_queryset hides recordings (they appear in the
        stream archive instead), so detail actions like editing metadata
        or uploading a thumbnail need this wider lookup.
        """
        return Lesson.objects.filter(pk=pk, deleted_at__isnull=True).first()

    @action(detail=True, methods=['patch'], url_path='metadata')
    def metadata(self, request, pk=None):
        """
        Update editable metadata of any lesson (including stream
        recordings): title, description, groups.  This avoids the
        recordings-hidden default queryset.

        Body: { "title"?: str, "description"?: str, "groups"?: [uuid] }
        """
        lesson = self._get_any_lesson(pk)
        if not lesson:
            return Response({'detail': 'Not found.'},
                            status=status.HTTP_404_NOT_FOUND)
        update = []
        if 'title' in request.data:
            t = (request.data.get('title') or '').strip()
            if not t:
                return Response({'detail': 'title cannot be empty.'},
                                status=status.HTTP_400_BAD_REQUEST)
            lesson.title = t
            update.append('title')
        if 'description' in request.data:
            lesson.description = request.data.get('description') or ''
            update.append('description')
        if update:
            update.append('updated_at')
            lesson.save(update_fields=update)
        if 'groups' in request.data:
            groups = request.data.get('groups') or []
            lesson.groups.set(groups)
        return Response(LessonAdminSerializer(lesson).data)

    @action(detail=True, methods=['post'], url_path='thumbnail-upload-url')
    def thumbnail_upload_url(self, request, pk=None):
        """
        Return a presigned PUT URL so the browser can upload a thumbnail
        directly to R2, then saves the thumbnail_url on the lesson.

        If R2_PUBLIC_URL is configured, the thumbnail URL is the permanent
        public URL (no expiry).  Otherwise a 1-hour presigned download URL
        is returned as a fallback (local-dev convenience).

        Works on stream-recording lessons too (uses _get_any_lesson).

        Response: { upload_url, thumbnail_url }
        """
        from django.conf import settings as dj_settings
        lesson = self._get_any_lesson(pk)
        if not lesson:
            return Response({'detail': 'Not found.'},
                            status=status.HTTP_404_NOT_FOUND)
        key = f"thumbnails/{lesson.id}.jpg"

        try:
            upload_url = R2StorageService.create_upload_presigned_url(
                key=key, content_type='image/jpeg', ttl_seconds=600,
            )
        except ImproperlyConfigured as e:
            return Response(
                {'detail': f'R2 not configured: {e}'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception as e:
            logger.exception('thumbnail presigned URL failed')
            return Response({'detail': str(e)}, status=status.HTTP_502_BAD_GATEWAY)

        pub = (getattr(dj_settings, 'R2_PUBLIC_URL', '') or '').rstrip('/')
        if pub:
            thumbnail_url = f"{pub}/{key}"
        else:
            # No public URL: use a presigned download URL.
            # We use a 7-day TTL so thumbnails stay valid across sessions;
            # the serializer will auto-regenerate it on the next API call anyway.
            try:
                thumbnail_url = R2StorageService.create_download_presigned_url(
                    key=key, ttl_seconds=7 * 24 * 3600,
                )
            except Exception:
                thumbnail_url = ''

        # Pre-save the URL so the lesson card updates after the browser PUT.
        lesson.thumbnail_url = thumbnail_url
        lesson.save(update_fields=['thumbnail_url', 'updated_at'])

        return Response({'upload_url': upload_url, 'thumbnail_url': thumbnail_url})

    @action(detail=False, methods=['get'])
    def trash(self, request):
        """List soft-deleted lessons."""
        qs = Lesson.objects.filter(deleted_at__isnull=False).order_by('-deleted_at')
        return Response(LessonAdminSerializer(qs, many=True).data)

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        """Restore a lesson from trash."""
        lesson = Lesson.objects.filter(pk=pk, deleted_at__isnull=False).first()
        if not lesson:
            return Response({'detail': 'Not found in trash.'},
                            status=status.HTTP_404_NOT_FOUND)
        lesson.deleted_at = None
        lesson.is_published = True
        lesson.save(update_fields=['deleted_at', 'is_published', 'updated_at'])
        return Response(LessonAdminSerializer(lesson).data)

    @action(detail=True, methods=['delete'], url_path='permanent')
    def permanent_destroy(self, request, pk=None):
        """Permanently delete a lesson from trash."""
        lesson = Lesson.objects.filter(pk=pk, deleted_at__isnull=False).first()
        if not lesson:
            return Response({'detail': 'Not found in trash.'},
                            status=status.HTTP_404_NOT_FOUND)
        lesson.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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
        return LiveStream.objects.filter(deleted_at__isnull=True).order_by('-created_at')

    def perform_destroy(self, instance):
        instance.deleted_at = timezone.now()
        instance.save(update_fields=['deleted_at', 'updated_at'])

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

    @action(detail=True, methods=['post'], url_path='manual-archive')
    def manual_archive(self, request, pk=None):
        """Manually create an archive lesson for a completed stream (when CF webhook failed).

        Tries to fetch the latest video for this live input from Cloudflare
        if recording_uid is empty (webhook didn't fire).
        """
        stream = self.get_object()
        if stream.archived_lesson_id:
            return Response({'detail': 'У эфира уже есть запись.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if stream.status not in ('ended', 'archived', 'live'):
            return Response({'detail': 'Эфир должен быть завершён.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # If we don't have a recording_uid, try to fetch the latest video
        # for this live input from CF Stream API.
        recording_uid = stream.recording_uid
        if not recording_uid and stream.cf_input_uid:
            try:
                recording_uid = CloudflareStreamService.find_latest_recording(
                    live_input_uid=stream.cf_input_uid,
                )
                if recording_uid:
                    stream.recording_uid = recording_uid
                    stream.save(update_fields=['recording_uid', 'updated_at'])
            except Exception:
                logger.exception('Failed to query CF Stream for recording')

        if not recording_uid:
            return Response({
                'detail': 'Cloudflare ещё не обработал запись. '
                          'Подождите 5–10 минут после завершения эфира и попробуйте снова.',
            }, status=status.HTTP_400_BAD_REQUEST)

        lesson = Lesson.objects.create(
            title=f"Эфир: {stream.title}",
            description=stream.description or '',
            lesson_type='video',
            stream_uid=recording_uid,
            duration_sec=0,
            thumbnail_url='',
            trainer=stream.trainer,
            is_published=True,
            published_at=timezone.now(),
            created_by=request.user if request.user.is_authenticated else None,
        )
        if stream.groups.exists():
            lesson.groups.set(list(stream.groups.values_list('id', flat=True)))
        stream.archived_lesson = lesson
        if stream.status != 'archived':
            stream.status = 'archived'
        if not stream.ended_at:
            stream.ended_at = timezone.now()
        stream.save(update_fields=['archived_lesson', 'status', 'ended_at', 'updated_at'])
        return Response(LiveStreamAdminSerializer(stream).data)

    @action(detail=False, methods=['get'])
    def trash(self, request):
        qs = LiveStream.objects.filter(deleted_at__isnull=False).order_by('-deleted_at')
        return Response(LiveStreamAdminSerializer(qs, many=True).data)

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        stream = LiveStream.objects.filter(pk=pk, deleted_at__isnull=False).first()
        if not stream:
            return Response({'detail': 'Not found in trash.'},
                            status=status.HTTP_404_NOT_FOUND)
        stream.deleted_at = None
        stream.save(update_fields=['deleted_at', 'updated_at'])
        return Response(LiveStreamAdminSerializer(stream).data)

    @action(detail=True, methods=['delete'], url_path='permanent')
    def permanent_destroy(self, request, pk=None):
        stream = LiveStream.objects.filter(pk=pk, deleted_at__isnull=False).first()
        if not stream:
            return Response({'detail': 'Not found in trash.'},
                            status=status.HTTP_404_NOT_FOUND)
        stream.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Consultations
# ---------------------------------------------------------------------------

class ConsultationAdminViewSet(viewsets.ModelViewSet):
    """Admin CRUD for 1-on-1 consultation links."""
    serializer_class = ConsultationSerializer
    permission_classes = [IsAuthenticated, IsTeacherOrAdmin]

    def get_queryset(self):
        return Consultation.objects.filter(deleted_at__isnull=True).order_by('-created_at')

    def perform_destroy(self, instance):
        instance.deleted_at = timezone.now()
        instance.status = 'cancelled'
        instance.save(update_fields=['deleted_at', 'status', 'updated_at'])

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
        # Allow trainer to rejoin 'used' consultations while still ongoing
        if consultation.status not in ('active', 'used'):
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

    @action(detail=False, methods=['get'])
    def trash(self, request):
        qs = Consultation.objects.filter(deleted_at__isnull=False).order_by('-deleted_at')
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        consultation = Consultation.objects.filter(pk=pk, deleted_at__isnull=False).first()
        if not consultation:
            return Response({'detail': 'Not found in trash.'},
                            status=status.HTTP_404_NOT_FOUND)
        consultation.deleted_at = None
        consultation.status = 'active'
        consultation.save(update_fields=['deleted_at', 'status', 'updated_at'])
        return Response(self.get_serializer(consultation).data)

    @action(detail=True, methods=['delete'], url_path='permanent')
    def permanent_destroy(self, request, pk=None):
        consultation = Consultation.objects.filter(pk=pk, deleted_at__isnull=False).first()
        if not consultation:
            return Response({'detail': 'Not found in trash.'},
                            status=status.HTTP_404_NOT_FOUND)
        consultation.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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

        # Eligible clients: those whose group has at least one published lesson.
        # Without this filter, students in brand-new groups (no lessons yet)
        # would falsely show up as "inactive".
        groups_with_lessons = list(
            Lesson.objects.filter(is_published=True, deleted_at__isnull=True)
            .values_list('groups__id', flat=True).distinct()
        )
        groups_with_lessons = [g for g in groups_with_lessons if g]

        clients_qs = Client.objects.filter(
            deleted_at__isnull=True,
            group__isnull=False,
            group_id__in=groups_with_lessons,
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
