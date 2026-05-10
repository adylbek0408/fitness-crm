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
from django.db.models import Avg, Count, Max, Q, Subquery
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.clients.models import Client

from .models import (
    Consultation, Lesson, LessonProgress, LiveStream,
    StreamChatMessage, StreamGuest,
)
from .permissions import IsTeacherOrAdmin
from .serializers import (
    ConsultationSerializer,
    LessonAdminSerializer,
    LiveStreamAdminSerializer,
    StreamChatMessageSerializer,
    StreamGuestSerializer,
)
from .services import CloudflareStreamService, JitsiService, R2StorageService


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
        # Double guard: also exclude by stream_uid for old recordings where the
        # archived_lesson FK wasn't set (source_streams is null for those too).
        _rec_uids = LiveStream.objects.filter(
            recording_uid__gt='', deleted_at__isnull=True,
        ).values('recording_uid')
        qs = Lesson.objects.filter(
            deleted_at__isnull=True, source_streams__isnull=True,
        ).exclude(stream_uid__in=Subquery(_rec_uids))
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

        # Whitelist file extensions before they make it into R2 keys —
        # otherwise a malicious value like '../../../config' would let the
        # client place an object outside the intended prefix or with a
        # confusable Content-Type.
        ALLOWED_VIDEO_EXTS = {'mp4', 'mov', 'webm', 'mkv', 'm4v'}
        ALLOWED_AUDIO_EXTS = {'mp3', 'wav', 'webm', 'm4a', 'ogg'}

        try:
            if lesson_type == 'video':
                max_dur = int(request.data.get('max_duration_sec') or 14400)
                file_ext = (request.data.get('file_ext') or 'mp4').lstrip('.').lower()
                if file_ext not in ALLOWED_VIDEO_EXTS:
                    file_ext = 'mp4'

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
                ext = (request.data.get('file_ext') or 'mp3').lstrip('.').lower()
                if ext not in ALLOWED_AUDIO_EXTS:
                    ext = 'mp3'
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
        if 'thumbnail_url' in request.data:
            # Frontend confirms successful R2 PUT — only now persist the URL.
            new_url = (request.data.get('thumbnail_url') or '').strip()
            lesson.thumbnail_url = new_url
            update.append('thumbnail_url')
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

        # IMPORTANT: do NOT save thumbnail_url here. If the browser's PUT to R2
        # fails (CORS, network), we'd be left with a URL pointing at nothing
        # and a broken-image placeholder forever. Frontend confirms success via
        # PATCH /metadata/ { thumbnail_url } only after the PUT returns 200.
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
            cf_webrtc_playback_url=payload.get('webrtc_playback_url', ''),
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

    @action(detail=True, methods=['post'], url_path='whip-proxy')
    def whip_proxy(self, request, pk=None):
        """Proxy WHIP SDP offer to Cloudflare Stream server-side.

        The browser can't read CF's Location response header due to CORS, so we
        proxy the WHIP POST here. We capture the session URL from Location and
        return it as 'session_url' so stopBroadcast can send a reliable DELETE.
        """
        stream = self.get_object()
        if not stream.cf_webrtc_url:
            return Response({'detail': 'cf_webrtc_url not set on this stream'}, status=400)

        sdp = (request.data or {}).get('sdp', '')
        if not sdp:
            return Response({'detail': 'sdp field required'}, status=400)

        import requests as _req
        try:
            cf = _req.post(
                stream.cf_webrtc_url,
                data=sdp.encode(),
                headers={'Content-Type': 'application/sdp'},
                timeout=15,
            )
        except Exception as e:
            logger.warning('WHIP proxy request failed stream=%s: %s', stream.id, e)
            return Response({'detail': str(e)}, status=503)

        if not cf.ok:
            logger.warning('WHIP proxy CF error stream=%s status=%s', stream.id, cf.status_code)
            return Response({'detail': f'CF WHIP returned {cf.status_code}'}, status=cf.status_code)

        session_url = cf.headers.get('Location', '')
        # CF returns a path-only Location header (no scheme/host).
        # Make it absolute so the frontend DELETE and the backend fallback DELETE both work.
        if session_url and session_url.startswith('/'):
            from urllib.parse import urlparse
            base = urlparse(stream.cf_webrtc_url)
            session_url = f'{base.scheme}://{base.netloc}{session_url}'
        logger.warning('WHIP proxy OK stream=%s CF=%s session_url=%s',
                       stream.id, cf.status_code, session_url[:120] if session_url else 'none')
        return Response({'sdp': cf.text, 'session_url': session_url})

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

        # Proxy WHIP DELETE to Cloudflare so recording is triggered reliably.
        # Prefer the session URL (from whip-proxy response); fall back to the
        # publish URL so CF at least gets *some* signal to finalize recording.
        whip_resource_url = (request.data or {}).get('whip_resource_url', '')
        whip_delete_url = whip_resource_url or stream.cf_webrtc_url
        if whip_delete_url:
            try:
                import requests as _req
                del_resp = _req.delete(whip_delete_url, timeout=10)
                logger.warning(
                    'WHIP DELETE stream=%s url=%s status=%s body=%s',
                    stream.id, whip_delete_url[:80], del_resp.status_code, del_resp.text[:200],
                )
            except Exception:
                logger.warning('WHIP DELETE failed for stream=%s', stream.id, exc_info=True)

        return Response(LiveStreamAdminSerializer(stream).data)

    @action(detail=True, methods=['get'])
    def viewers(self, request, pk=None):
        from .serializers import StreamViewerSerializer
        stream = self.get_object()
        viewers = stream.viewers.filter(is_active=True).select_related('client')
        return Response(StreamViewerSerializer(viewers, many=True).data)

    # ── Chat ──────────────────────────────────────────────────────────────────

    @action(detail=True, methods=['get', 'post'], url_path='chat')
    def chat(self, request, pk=None):
        """GET: list messages (poll). POST: trainer sends a message."""
        stream = self.get_object()
        if request.method == 'GET':
            after = request.query_params.get('after')
            qs = StreamChatMessage.objects.filter(
                stream=stream, deleted_at__isnull=True,
            ).order_by('created_at')
            if after:
                from datetime import datetime
                try:
                    # Frontend sends ISO-8601 (e.g. "2026-05-08T19:30:00.123Z").
                    parsed = datetime.fromisoformat(after.replace('Z', '+00:00'))
                    qs = qs.filter(created_at__gt=parsed)
                except (ValueError, TypeError):
                    pass
            return Response(StreamChatMessageSerializer(qs, many=True).data)

        text = (request.data.get('text') or '').strip()
        if not text:
            return Response({'error': 'text required'}, status=400)
        msg = StreamChatMessage.objects.create(
            stream=stream,
            sender_name='Тренер',
            text=text[:500],
            is_trainer=True,
        )
        return Response(StreamChatMessageSerializer(msg).data, status=201)

    # ── Guests ────────────────────────────────────────────────────────────────

    @action(detail=True, methods=['get', 'post'], url_path='guests')
    def guests(self, request, pk=None):
        """GET: list active/invited guests. POST: invite a client."""
        stream = self.get_object()
        if request.method == 'GET':
            qs = StreamGuest.objects.filter(
                stream=stream,
                status__in=['invited', 'active'],
                deleted_at__isnull=True,
            ).select_related('client')
            return Response(StreamGuestSerializer(qs, many=True).data)

        client_id = request.data.get('client_id')
        if not client_id:
            return Response({'error': 'client_id required'}, status=400)
        try:
            client = Client.objects.get(pk=client_id)
        except Client.DoesNotExist:
            return Response({'error': 'client not found'}, status=404)

        # Cancel ALL existing pending or active invites for this client in
        # this stream — not just 'invited'. If a previous P2P session is
        # half-alive (status='active' but the guest already navigated away,
        # or trainer kicked them via guest_end which only flips status),
        # leaving it visible would create two parallel guest_polls on the
        # student side — they'd see double invites or even start two P2P
        # PCs to the same trainer.
        # We hard-flag them as ended AND set deleted_at so the student-side
        # /cabinet/.../guest/ endpoint stops returning them.
        from django.utils import timezone as dj_tz
        now = dj_tz.now()
        StreamGuest.objects.filter(
            stream=stream, client=client,
            status__in=['invited', 'active'],
            deleted_at__isnull=True,
        ).update(status='ended', deleted_at=now)

        # WebRTC P2P (no Jitsi): trainer initiates the offer once guest accepts.
        guest = StreamGuest.objects.create(
            stream=stream,
            client=client,
            jitsi_room='',
        )
        return Response(StreamGuestSerializer(guest).data, status=201)

    @action(detail=True, methods=['post'], url_path=r'guests/(?P<guest_id>[^/.]+)/end')
    def guest_end(self, request, pk=None, guest_id=None):
        """End / kick a guest session."""
        stream = self.get_object()
        try:
            guest = StreamGuest.objects.get(pk=guest_id, stream=stream)
        except StreamGuest.DoesNotExist:
            return Response(status=404)
        guest.status = 'ended'
        guest.save(update_fields=['status'])
        return Response(status=204)

    @action(
        detail=True,
        methods=['get', 'post'],
        url_path=r'guests/(?P<guest_id>[^/.]+)/webrtc',
    )
    def guest_webrtc(self, request, pk=None, guest_id=None):
        """WebRTC signaling for trainer side.

        GET → returns { answer_sdp, guest_ice: [...], status }
        POST { offer_sdp } → store trainer's offer
        POST { ice: {...} } → append ICE candidate to trainer_ice
        POST { reset: true } → clear all signaling fields (re-negotiation)
        """
        try:
            guest = StreamGuest.objects.get(pk=guest_id, stream_id=pk)
        except StreamGuest.DoesNotExist:
            return Response({'error': 'guest not found'}, status=404)

        if request.method == 'GET':
            return Response({
                'status':     guest.status,
                'answer_sdp': guest.answer_sdp,
                'guest_ice':  guest.guest_ice or [],
            })

        # POST
        data = request.data or {}
        if data.get('reset'):
            guest.offer_sdp = ''
            guest.answer_sdp = ''
            guest.trainer_ice = []
            guest.guest_ice = []
            guest.save(update_fields=['offer_sdp', 'answer_sdp', 'trainer_ice', 'guest_ice'])
            return Response({'ok': True})
        if 'offer_sdp' in data:
            guest.offer_sdp = data['offer_sdp'] or ''
            guest.answer_sdp = ''
            guest.trainer_ice = []
            guest.guest_ice = []
            guest.save(update_fields=['offer_sdp', 'answer_sdp', 'trainer_ice', 'guest_ice'])
        if 'ice' in data and data['ice']:
            ice_list = list(guest.trainer_ice or [])
            ice_list.append(data['ice'])
            guest.trainer_ice = ice_list
            guest.save(update_fields=['trainer_ice'])
        return Response({'ok': True})

    @action(detail=True, methods=['get'], url_path='active-viewers')
    def active_viewers(self, request, pk=None):
        """List currently-watching clients (for invite picker)."""
        stream = self.get_object()
        cutoff = timezone.now() - timedelta(seconds=30)
        viewers = stream.viewers.filter(
            is_active=True,
            last_heartbeat_at__gte=cutoff,
        ).select_related('client')
        data = [
            {
                'id': str(v.client_id),
                'name': f'{v.client.first_name} {v.client.last_name}'.strip(),
            }
            for v in viewers
        ]
        return Response(data)

    @action(detail=True, methods=['post'], url_path='turn-credentials')
    def turn_credentials(self, request, pk=None):
        """Generate short-lived Cloudflare TURN credentials for WebRTC P2P.

        Called by the trainer's browser before establishing the P2P
        connection with the invited guest. Returns an iceServers array
        that includes TURN relays — required for NAT traversal between
        mobile (cellular) and desktop/Wi-Fi participants.
        """
        import os, requests as req_lib
        key_id  = os.environ.get('CF_TURN_KEY_ID', '')
        key_tok = os.environ.get('CF_TURN_API_TOKEN', '')
        if not key_id or not key_tok:
            # Graceful fallback: return only STUN so the UI doesn't break
            return Response({'iceServers': [
                {'urls': 'stun:stun.cloudflare.com:3478'},
                {'urls': 'stun:stun.l.google.com:19302'},
            ]})
        try:
            resp = req_lib.post(
                f'https://rtc.live.cloudflare.com/v1/turn/keys/{key_id}/credentials/generate-ice-servers',
                headers={'Authorization': f'Bearer {key_tok}', 'Content-Type': 'application/json'},
                json={'ttl': 86400},
                timeout=5,
            )
            resp.raise_for_status()
            data = resp.json()
            # CF returns { "iceServers": { "urls": [...], "username": "...", "credential": "..." } }
            # Normalise to array form expected by RTCPeerConnection.
            ice = data.get('iceServers', {})
            ice_servers = [ice] if isinstance(ice, dict) else ice
            # Always prepend STUN (cheap, no traffic cost)
            ice_servers = [
                {'urls': 'stun:stun.cloudflare.com:3478'},
                {'urls': 'stun:stun.l.google.com:19302'},
            ] + ice_servers
            return Response({'iceServers': ice_servers})
        except Exception as e:
            logger.warning('CF TURN credentials failed: %s', e)
            return Response({'iceServers': [
                {'urls': 'stun:stun.cloudflare.com:3478'},
                {'urls': 'stun:stun.l.google.com:19302'},
            ]})

    @action(detail=True, methods=['get'], url_path='cf-status')
    def cf_status(self, request, pk=None):
        """Diagnostic: query CF Stream for actual state of this live input.

        Used by frontend to show admin what's happening with the stream/recording
        before/during/after broadcast. Helps debug when 'нет записи' is reported.
        """
        stream = self.get_object()
        if not stream.cf_input_uid:
            return Response({
                'configured': False,
                'detail': 'У эфира нет cf_input_uid. Пересоздайте эфир.',
            })
        try:
            info = CloudflareStreamService.get_live_input_status(stream.cf_input_uid)
        except ImproperlyConfigured as e:
            return Response({'configured': False, 'detail': str(e)},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        # Sanitize recordings for frontend (just what we need for UI)
        recordings_summary = [
            {
                'uid': r.get('uid', ''),
                'state': (r.get('status') or {}).get('state', ''),
                'pct_complete': (r.get('status') or {}).get('pctComplete', ''),
                'ready': r.get('readyToStream', False),
                'duration': r.get('duration', 0),
                'created': r.get('created', ''),
            }
            for r in (info.get('recordings') or [])
        ]
        return Response({
            'configured': True,
            'live_input_state': info['state'],   # connected / disconnected / unknown
            'last_seen_at': info['last_seen_at'],
            'recordings_count': info['recordings_count'],
            'has_ready_recording': info['has_ready_recording'],
            'recordings': recordings_summary,
            'stream_status': stream.status,
            'has_archived_lesson': bool(stream.archived_lesson_id),
        })

    @action(detail=True, methods=['get'], url_path='recording-status')
    def recording_status(self, request, pk=None):
        """Lightweight: return recording preparation progress for the streams list.

        Pipeline stages reflected to the client:
          - 'ready':       archived_lesson exists AND CF says video is ready.
          - 'processing':  upload to CF complete, but CF still transcoding.
          - 'uploading':   browser is still uploading the WebM (UI hint only;
                           tracked client-side via sessionStorage).
          - 'missing':     stream is ended but no recording_uid yet.

        We only own 'ready'/'processing'/'missing'; 'uploading' is reported by
        the frontend itself when an XHR is in flight.
        """
        stream = self.get_object()
        # Ready if we have a published archive lesson.
        # Verify with CF in case CF is still transcoding (the lesson row was
        # created right after upload but the video isn't playable yet).
        video_uid = ''
        if stream.archived_lesson_id:
            try:
                video_uid = stream.archived_lesson.stream_uid or ''
            except Lesson.DoesNotExist:
                video_uid = ''
        if not video_uid:
            video_uid = stream.recording_uid or ''

        if not video_uid:
            # archived_lesson exists but no CF uid yet → background thread is
            # still pushing the WebM up to Cloudflare. Distinguish from
            # 'missing' (no upload happened at all) so the UI keeps the
            # progress bar visible.
            if stream.archived_lesson_id:
                return Response({
                    'stage': 'uploading',
                    'pct': 0,
                    'ready': False,
                    'has_archived_lesson': True,
                })
            return Response({
                'stage': 'missing',
                'pct': 0,
                'ready': False,
                'has_archived_lesson': False,
            })

        try:
            info = CloudflareStreamService.get_video_status(video_uid)
        except ImproperlyConfigured:
            return Response({
                'stage': 'missing', 'pct': 0, 'ready': False,
                'has_archived_lesson': bool(stream.archived_lesson_id),
            })

        # Report ready when CF finished transcoding AND a lesson row exists.
        # This ensures the progress bar stays visible during CF transcoding
        # even when the lesson was already published (is_published=True).
        has_lesson = bool(stream.archived_lesson_id)
        cf_ready = info['ready']
        ready = cf_ready and has_lesson
        return Response({
            'stage': 'ready' if ready else 'processing',
            'pct': 100 if cf_ready else info['pct_complete'],
            'ready': ready,
            'cf_state': info['state'],
            'has_archived_lesson': has_lesson,
        })

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
        cf_info = None
        if not recording_uid and stream.cf_input_uid:
            try:
                cf_info = CloudflareStreamService.get_live_input_status(stream.cf_input_uid)
                # Pick the first ready recording
                for r in (cf_info.get('recordings') or []):
                    if r.get('readyToStream', False):
                        recording_uid = r.get('uid', '')
                        break
                if recording_uid:
                    stream.recording_uid = recording_uid
                    stream.save(update_fields=['recording_uid', 'updated_at'])
            except Exception:
                logger.exception('Failed to query CF Stream for recording')

        if not recording_uid:
            # Build a more informative error based on what CF actually sees.
            recordings = (cf_info or {}).get('recordings', [])
            if not recordings:
                msg = ('Cloudflare не получил данных эфира. '
                       'Возможно WebRTC соединение прервалось. '
                       'Проверьте что сайт работает по HTTPS.')
            else:
                # There IS a recording but it's still processing
                processing = [r for r in recordings if not r.get('readyToStream', False)]
                if processing:
                    states = ', '.join({(r.get('status') or {}).get('state', '?') for r in processing})
                    msg = (f'Cloudflare ещё обрабатывает запись (состояние: {states}). '
                           f'Обычно это занимает 1–3 минуты после окончания эфира.')
                else:
                    msg = 'Запись не найдена. Свяжитесь с администратором.'
            return Response({
                'detail': msg,
                'recordings_count': len(recordings),
                'recordings_processing': len([r for r in recordings if not r.get('readyToStream', False)]),
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

    @action(detail=True, methods=['post'], url_path='publish-recording')
    def publish_recording(self, request, pk=None):
        """Publish the archived lesson so students can watch the recording."""
        stream = self.get_object()
        if not stream.archived_lesson_id:
            return Response({'detail': 'У эфира нет записи.'}, status=status.HTTP_400_BAD_REQUEST)
        lesson = stream.archived_lesson
        lesson.is_published = True
        lesson.published_at = timezone.now()
        lesson.save(update_fields=['is_published', 'published_at', 'updated_at'])
        return Response(LiveStreamAdminSerializer(stream).data)

    @action(detail=True, methods=['post'], url_path='upload-recording')
    def upload_recording(self, request, pk=None):
        """Receive a WebM recording from the browser and hand it off to CF.

        Pipeline (returns 202 as soon as the file is on disk so the trainer
        can leave the broadcast page immediately):
          1. Browser → Django: multipart upload, saved to a temp file.
          2. Django creates the Lesson row + links it to the stream.
          3. A daemon thread picks up the temp file and uploads it to CF
             Stream server-to-server. recording_uid is filled in once CF
             accepts the upload.
          4. /recording-status/ reports stage='uploading' until the thread
             finishes the CF push, then 'processing' while CF transcodes,
             then 'ready'.

        Requires nginx: client_max_body_size 2g (see deploy/nginx.conf).
        """
        stream = self.get_object()
        if stream.archived_lesson_id:
            return Response({'detail': 'У эфира уже есть запись.'}, status=status.HTTP_400_BAD_REQUEST)

        video_file = request.FILES.get('file')
        if not video_file:
            return Response({'detail': 'Нет файла (поле: file).'}, status=status.HTTP_400_BAD_REQUEST)

        # Save the upload to a temp file on disk — Django's
        # TemporaryUploadedFile is auto-deleted when this request finishes,
        # but the background thread needs the bytes to live longer than that.
        import os
        import tempfile
        import threading
        tmp_fd, tmp_path = tempfile.mkstemp(prefix='stream-rec-', suffix='.webm')
        try:
            with os.fdopen(tmp_fd, 'wb') as out:
                for chunk in video_file.chunks():
                    out.write(chunk)
        except Exception as e:
            try:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
            except OSError:
                pass
            logger.exception('failed to spool upload to disk stream=%s', stream.id)
            return Response(
                {'detail': f'Не смог сохранить временный файл: {e}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        content_type = video_file.content_type or 'video/webm'
        file_size = os.path.getsize(tmp_path)

        # Create the lesson row + link to stream NOW so the streams list shows
        # "archive in progress" immediately. stream_uid is populated by the
        # background thread once CF accepts the upload.
        #
        # IMPORTANT: lesson starts as `is_published=False`. Cabinet endpoints
        # filter on is_published=True, so a half-baked archive (no CF UID,
        # cannot play) never leaks into the student's lessons list while the
        # thread is still uploading. We flip it to True only when the CF
        # upload actually succeeds (in the thread) — or when the CF webhook
        # 'video.ready' fires later.
        from django.db import transaction
        with transaction.atomic():
            lesson = Lesson.objects.create(
                title=f"Эфир: {stream.title}",
                description=stream.description or '',
                lesson_type='video',
                stream_uid='',
                duration_sec=0,
                thumbnail_url='',
                trainer=stream.trainer,
                is_published=False,
                created_by=request.user if request.user.is_authenticated else None,
            )
            if stream.groups.exists():
                lesson.groups.set(list(stream.groups.values_list('id', flat=True)))
            stream.archived_lesson = lesson
            stream.status = 'archived'
            if not stream.ended_at:
                stream.ended_at = timezone.now()
            stream.save(update_fields=['archived_lesson', 'status', 'ended_at', 'updated_at'])

        stream_id = stream.id
        lesson_id = lesson.id
        title = stream.title

        def _upload_to_cf():
            try:
                upload_info = CloudflareStreamService.create_direct_upload_url(
                    max_duration_sec=3 * 3600,
                    name=f'Эфир: {title}',
                )
                video_uid = upload_info['video_uid']
                upload_url = upload_info['upload_url']

                import requests as _req
                with open(tmp_path, 'rb') as f:
                    resp = _req.post(
                        upload_url,
                        files={'file': ('recording.webm', f, content_type)},
                        timeout=1200,  # 20 min ceiling for huge sessions
                    )
                    resp.raise_for_status()
                logger.warning(
                    '[bg-cf-upload] OK stream=%s video_uid=%s size=%s',
                    stream_id, video_uid, file_size,
                )
                # Publish the lesson now — CF still needs to transcode but
                # the upload is on their servers, the playback URL will
                # resolve once transcoding is done.
                Lesson.objects.filter(pk=lesson_id).update(
                    stream_uid=video_uid,
                    is_published=True,
                    published_at=timezone.now(),
                )
                LiveStream.objects.filter(pk=stream_id).update(recording_uid=video_uid)
            except Exception as e:
                logger.exception('[bg-cf-upload] failed stream=%s: %s', stream_id, e)
            finally:
                try:
                    if os.path.exists(tmp_path):
                        os.unlink(tmp_path)
                except OSError:
                    pass

        threading.Thread(target=_upload_to_cf, daemon=True).start()

        # Refresh the instance so the response reflects the new archived_lesson link
        stream.refresh_from_db()
        return Response(
            LiveStreamAdminSerializer(stream).data,
            status=status.HTTP_202_ACCEPTED,
        )

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
            logger.error('CF webhook: CF_STREAM_WEBHOOK_SECRET not set — rejecting')
            return Response({'detail': 'Webhook secret not configured.'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if not ok:
            logger.warning('CF webhook: invalid signature (sig=%s)', sig[:40] if sig else 'empty')
            return Response({'detail': 'Invalid signature.'},
                            status=status.HTTP_401_UNAUTHORIZED)

        logger.info('CF webhook received: body_len=%d sig_present=%s', len(body), bool(sig))

        try:
            payload = request.data or {}
        except Exception:
            payload = {}

        event_type = (payload.get('eventType')
                      or payload.get('event')
                      or '').lower()
        logger.info('CF webhook event=%s keys=%s', event_type, list(payload.keys()))
        # Cloudflare's events sometimes only put info in `meta` / fields,
        # so handle two common shapes.

        # Case 1: live recording ready (preferred event for auto-archive).
        # CF Stream sends different shapes depending on event type:
        #   video.ready: {"uid": "vid_uid", "meta": {"live_input": "input_uid"}, ...}
        #   live_input.recording.ready: {"liveInput": {"uid": "input_uid"}, "video": {"uid": "vid_uid"}}
        _live_input_raw = payload.get('liveInput') or {}
        live_input_uid = (
            (payload.get('meta') or {}).get('live_input')       # video.ready shape
            or (payload.get('live_input') or '')                 # flat string form
            or (_live_input_raw.get('uid') if isinstance(_live_input_raw, dict) else _live_input_raw)  # nested obj
            or ''
        )
        _video_raw = payload.get('video') or {}
        video_uid = (
            payload.get('uid')                                   # video.ready top-level uid
            or (_video_raw.get('uid') if isinstance(_video_raw, dict) else '')  # nested in video.ready
            or payload.get('video_uid')
            or ''
        )
        # For live_input.recording.ready, duration/thumbnail live inside
        # payload["video"]; for video.ready they're at the top level.
        _video_raw_dict = _video_raw if isinstance(_video_raw, dict) else {}
        duration = (payload.get('duration')
                    or _video_raw_dict.get('duration')
                    or 0)
        thumbnail = (payload.get('thumbnail')
                     or _video_raw_dict.get('thumbnail')
                     or '')

        # Auto-archive: if we know which live input produced this video,
        # attach the lesson to that LiveStream.
        #
        # Idempotency: Cloudflare retries webhooks (we observed duplicate
        # deliveries in prod). Without locking, two concurrent calls could
        # both pass the `archived_lesson_id is None` check and create two
        # `Lesson` rows for the same recording. We wrap the read+update in a
        # transaction with `select_for_update` so the second delivery either
        # sees the already-set `archived_lesson` and bails, or sees the same
        # `recording_uid` and reuses the existing lesson.
        if live_input_uid and video_uid:
            from django.db import transaction
            with transaction.atomic():
                stream = (
                    LiveStream.objects.select_for_update()
                    .filter(cf_input_uid=live_input_uid)
                    .order_by('-created_at')
                    .first()
                )
                if stream and stream.archived_lesson_id:
                    # Already archived (likely a retry). No-op.
                    return Response({
                        'ok': True,
                        'archived_lesson_id': str(stream.archived_lesson_id),
                        'idempotent': True,
                    })
                if stream:
                    # Defensive: if a Lesson with this exact stream_uid already
                    # exists (e.g. webhook arrived twice and the prior call
                    # created the row before this transaction got the lock),
                    # link it instead of creating a duplicate.
                    lesson = Lesson.objects.filter(stream_uid=video_uid).first()
                    if not lesson:
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

        # Case 2: regular uploaded video became ready — backfill metadata
        # and publish if it was waiting for CF (async upload from a stream).
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
                if not lesson.is_published:
                    lesson.is_published = True
                    lesson.published_at = timezone.now()
                    update += ['is_published', 'published_at']
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

        # Per-lesson stats — single aggregated query keyed by lesson_id
        # (used to be N+1: one .aggregate() call per lesson). On a school
        # with hundreds of lessons that pegged the DB on every Stats open.
        ordered_lessons = list(
            lessons_qs.prefetch_related('groups').order_by('-published_at', '-created_at')
        )
        progress_by_lesson = {
            row['lesson_id']: row
            for row in LessonProgress.objects.filter(
                lesson_id__in=[l.id for l in ordered_lessons]
            ).values('lesson_id').annotate(
                viewers_count=Count('id'),
                avg_percent=Avg('percent_watched'),
                completed_count=Count('id', filter=Q(is_completed=True)),
            )
        }
        lessons_data = []
        for l in ordered_lessons:
            agg = progress_by_lesson.get(l.id, {})
            lessons_data.append({
                'id': str(l.id),
                'title': l.title,
                'lesson_type': l.lesson_type,
                'duration_sec': l.duration_sec,
                'groups': [f'Группа {g.number}' for g in l.groups.all()],
                'viewers_count': agg.get('viewers_count') or 0,
                'avg_percent': round(agg.get('avg_percent') or 0.0, 1),
                'completed_count': agg.get('completed_count') or 0,
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
            group__training_format='online',  # only online students track lessons
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
                    'telegram_link': getattr(client, 'telegram_link', '') or '',
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
