"""
Student-facing views (cabinet JWT auth).

Mounted at /api/cabinet/education/...

Mirrors the patterns in apps/clients/cabinet_views.py:
- authentication_classes = [CabinetJWTAuthentication]
- permission_classes = [IsCabinetClient]
- request.user is a ClientAccount; the actual Client is request.user.client.
"""
import logging
from datetime import timedelta

from django.core.exceptions import ImproperlyConfigured
from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.clients.cabinet_auth import CabinetJWTAuthentication

from .models import Consultation, Lesson, LessonProgress, LiveStream, StreamViewer
from .permissions import IsCabinetClient
from .serializers import (
    LessonProgressSerializer,
    LessonSerializer,
    LiveStreamSerializer,
    StreamViewerSerializer,
)
from .services import (
    CloudflareStreamService,
    JitsiService,
    LessonAccessService,
    R2StorageService,
)


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lessons (read-only for students)
# ---------------------------------------------------------------------------

class CabinetLessonViewSet(viewsets.ReadOnlyModelViewSet):
    """List/detail of lessons accessible to the current cabinet client."""
    serializer_class = LessonSerializer
    authentication_classes = [CabinetJWTAuthentication]
    permission_classes = [IsCabinetClient]

    def get_queryset(self):
        client = self.request.user.client
        if not client.group_id:
            return Lesson.objects.none()

        client_tags = list(getattr(client.group, 'online_subscription_tags', None) or [])
        q = Q(groups__id=client.group_id)
        if client_tags:
            q |= Q(subscription_tags__overlap=client_tags) if False else Q()
            # JSONField overlap not portable across DBs; do a python-side fallback
            # below for tags. Keep direct group filter as the primary path.
        qs = Lesson.objects.filter(
            is_published=True, deleted_at__isnull=True,
        ).filter(q).distinct()

        # Tag intersection fallback (handles JSONField cleanly).
        if client_tags:
            tag_q = Lesson.objects.filter(
                is_published=True, deleted_at__isnull=True,
            ).exclude(id__in=qs.values_list('id', flat=True))
            extra_ids = []
            for lesson in tag_q.only('id', 'subscription_tags'):
                if set(lesson.subscription_tags or []) & set(client_tags):
                    extra_ids.append(lesson.id)
            if extra_ids:
                qs = Lesson.objects.filter(
                    Q(id__in=qs.values_list('id', flat=True))
                    | Q(id__in=extra_ids)
                ).distinct()

        ltype = self.request.query_params.get('type')
        if ltype in ('video', 'audio'):
            qs = qs.filter(lesson_type=ltype)

        # Sprint 3.6 — separate the live-stream archives from regular lessons.
        # `source=stream` → only lessons that were auto-created from recordings;
        # `source=lesson` → only manually uploaded lessons.
        source = self.request.query_params.get('source')
        if source == 'stream':
            qs = qs.filter(source_streams__isnull=False).distinct()
        elif source == 'lesson':
            qs = qs.filter(source_streams__isnull=True).distinct()
        return qs.order_by('-published_at', '-created_at')

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        client = request.user.client
        progress_map = {
            p.lesson_id: p for p in LessonProgress.objects.filter(
                client=client, lesson__in=page or qs,
            )
        }

        def serialize(lesson):
            data = self.get_serializer(lesson).data
            p = progress_map.get(lesson.id)
            data['progress'] = {
                'percent': p.percent_watched if p else 0,
                'last_position_sec': p.last_position_sec if p else 0,
                'is_completed': p.is_completed if p else False,
            }
            return data

        items = [serialize(l) for l in (page or qs)]
        if page is not None:
            return self.get_paginated_response(items)
        return Response(items)

    def retrieve(self, request, *args, **kwargs):
        lesson = self.get_object()
        client = request.user.client
        if not LessonAccessService.can_client_access(lesson, client):
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)
        data = self.get_serializer(lesson).data

        # Build a signed playback URL bound to this viewer.
        playback_url = None
        video_kind = None  # 'hls' | 'r2' | None
        try:
            if lesson.lesson_type == 'video' and lesson.stream_uid:
                playback_url = CloudflareStreamService.create_signed_playback_url(
                    video_uid=lesson.stream_uid, client_id=str(client.id),
                )
                video_kind = 'hls'
            elif lesson.lesson_type == 'video' and lesson.r2_key:
                # Video stored in R2 (CF Stream quota not available)
                playback_url = R2StorageService.create_download_presigned_url(
                    key=lesson.r2_key,
                )
                video_kind = 'r2'
            elif lesson.lesson_type == 'audio' and lesson.r2_key:
                playback_url = R2StorageService.create_download_presigned_url(
                    key=lesson.r2_key,
                )
        except ImproperlyConfigured as e:
            logger.warning('Playback URL not configured: %s', e)
        except Exception:
            logger.exception('Failed to build playback URL')

        progress = LessonProgress.objects.filter(client=client, lesson=lesson).first()
        data['playback_url'] = playback_url
        data['video_kind'] = video_kind
        data['watermark'] = {
            'text': f"{client.first_name or ''} {client.last_name or ''} • "
                    f"{getattr(client, 'phone', '')}".strip(),
            'client_id': str(client.id),
        }
        data['progress'] = {
            'percent': progress.percent_watched if progress else 0,
            'last_position_sec': progress.last_position_sec if progress else 0,
            'is_completed': progress.is_completed if progress else False,
        }
        return Response(data)

    @action(detail=True, methods=['post'], url_path='progress')
    def progress(self, request, pk=None):
        lesson = self.get_object()
        client = request.user.client
        if not LessonAccessService.can_client_access(lesson, client):
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            position = int(request.data.get('position', 0))
        except (TypeError, ValueError):
            position = 0
        try:
            percent = max(0, min(100, int(request.data.get('percent', 0))))
        except (TypeError, ValueError):
            percent = 0
        progress, _ = LessonProgress.objects.update_or_create(
            client=client,
            lesson=lesson,
            defaults={
                'last_position_sec': max(0, position),
                'percent_watched': percent,
                'is_completed': percent >= 95,
            },
        )
        return Response(LessonProgressSerializer(progress).data)


# ---------------------------------------------------------------------------
# Live streams
# ---------------------------------------------------------------------------

def _build_stream_playback_url(stream: LiveStream) -> str:
    """HLS playback URL for a live input. Public (CF Stream live-input HLS
    is keyed by playback id, not signed in MVP). Signed live URLs require
    `requireSignedURLs=True` on the input which we'll enable when needed."""
    customer = (
        stream._meta.app_config and ''  # noqa
    )
    from django.conf import settings as dj_settings
    sub = getattr(dj_settings, 'CF_STREAM_CUSTOMER', '')
    if not sub or not stream.cf_playback_id:
        return ''
    return f'https://{sub}.cloudflarestream.com/{stream.cf_playback_id}/manifest/video.m3u8'


class CabinetStreamView(APIView):
    """GET /api/cabinet/education/streams/active/ — current live stream for client's group.
    Optional ?id=<uuid> to fetch a specific stream (if the client has access).
    """
    authentication_classes = [CabinetJWTAuthentication]
    permission_classes = [IsCabinetClient]

    def get(self, request):
        client = request.user.client
        stream_id = request.query_params.get('id')

        if stream_id:
            # Fetch specific stream by ID (for shareable links)
            try:
                stream = LiveStream.objects.get(pk=stream_id)
            except LiveStream.DoesNotExist:
                return Response({'stream': None, 'reason': 'not_found'})
            # Access check: stream must belong to client's group OR have no groups
            if stream.groups.exists() and client.group_id:
                if not stream.groups.filter(id=client.group_id).exists():
                    return Response({'stream': None, 'reason': 'forbidden'})
        else:
            # Auto-detect active stream for client's group
            if not client.group_id:
                return Response({'stream': None})
            stream = LiveStream.objects.filter(
                status='live', groups__id=client.group_id,
            ).order_by('-started_at').first()
            if not stream:
                return Response({'stream': None})

        data = LiveStreamSerializer(stream).data
        data['playback_url'] = _build_stream_playback_url(stream)
        return Response({'stream': data})


class CabinetStreamJoinView(APIView):
    authentication_classes = [CabinetJWTAuthentication]
    permission_classes = [IsCabinetClient]

    def post(self, request, pk):
        client = request.user.client
        try:
            stream = LiveStream.objects.get(pk=pk, status='live')
        except LiveStream.DoesNotExist:
            return Response({'detail': 'Stream not active.'},
                            status=status.HTTP_404_NOT_FOUND)
        if not client.group_id or not stream.groups.filter(id=client.group_id).exists():
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

        viewer, _ = StreamViewer.objects.update_or_create(
            stream=stream, client=client,
            defaults={'is_active': True, 'left_at': None},
        )
        return Response({
            'viewer': StreamViewerSerializer(viewer).data,
            'playback_url': _build_stream_playback_url(stream),
            'watermark': {
                'text': f"{client.first_name or ''} {client.last_name or ''}".strip(),
            },
        })


class CabinetStreamHeartbeatView(APIView):
    authentication_classes = [CabinetJWTAuthentication]
    permission_classes = [IsCabinetClient]

    def post(self, request, pk):
        viewer = StreamViewer.objects.filter(
            stream_id=pk, client=request.user.client, is_active=True,
        ).first()
        if not viewer:
            # Recreate viewer record if stream still live.
            try:
                stream = LiveStream.objects.get(pk=pk, status='live')
            except LiveStream.DoesNotExist:
                return Response({'detail': 'Not joined.'},
                                status=status.HTTP_404_NOT_FOUND)
            client = request.user.client
            if not client.group_id or not stream.groups.filter(id=client.group_id).exists():
                return Response({'detail': 'Forbidden.'},
                                status=status.HTTP_403_FORBIDDEN)
            StreamViewer.objects.create(stream=stream, client=client, is_active=True)
            return Response({'ok': True, 'recreated': True})
        viewer.save(update_fields=['last_heartbeat_at', 'updated_at'])
        return Response({'ok': True})


class CabinetStreamViewersView(APIView):
    """Who is currently watching the live stream (client requirement)."""
    authentication_classes = [CabinetJWTAuthentication]
    permission_classes = [IsCabinetClient]

    def get(self, request, pk):
        client = request.user.client
        try:
            stream = LiveStream.objects.get(pk=pk)
        except LiveStream.DoesNotExist:
            return Response({'detail': 'Not found.'},
                            status=status.HTTP_404_NOT_FOUND)
        if not client.group_id or not stream.groups.filter(id=client.group_id).exists():
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

        # Drop stale viewers (heartbeat older than 30s).
        cutoff = timezone.now() - timedelta(seconds=30)
        StreamViewer.objects.filter(
            stream=stream, is_active=True, last_heartbeat_at__lt=cutoff,
        ).update(is_active=False, left_at=timezone.now())

        viewers = stream.viewers.filter(is_active=True).select_related('client')
        return Response(StreamViewerSerializer(viewers, many=True).data)


# ---------------------------------------------------------------------------
# Public consultation endpoint (no auth — link is the credential)
# ---------------------------------------------------------------------------

class PublicConsultationView(APIView):
    """GET /api/consultation/{room_uuid}/

    Public — opens with a link that the trainer sent over WhatsApp.
    Validates the link, increments used_count, and mints a Jitsi JWT.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, room_uuid):
        try:
            consultation = Consultation.objects.get(room_uuid=room_uuid)
        except Consultation.DoesNotExist:
            return Response({'valid': False, 'reason': 'not_found'},
                            status=status.HTTP_404_NOT_FOUND)

        # Auto-expire stale rows.
        if consultation.status == 'active' and consultation.expires_at \
                and consultation.expires_at < timezone.now():
            consultation.status = 'expired'
            consultation.save(update_fields=['status', 'updated_at'])

        if not consultation.is_consumable:
            return Response({'valid': False, 'reason': consultation.status})

        display_name = (request.query_params.get('name') or '').strip()
        if not display_name:
            if consultation.client:
                display_name = (
                    f"{consultation.client.first_name or ''} "
                    f"{consultation.client.last_name or ''}"
                ).strip() or 'Гость'
            else:
                display_name = 'Гость'

        # Increment usage (each fetch counts as a join attempt).
        consultation.used_count = (consultation.used_count or 0) + 1
        if consultation.used_count >= consultation.max_uses:
            consultation.status = 'used'
        if not consultation.started_at:
            consultation.started_at = timezone.now()
        consultation.save(update_fields=[
            'used_count', 'status', 'started_at', 'updated_at',
        ])

        from django.conf import settings as dj_settings
        domain = (getattr(dj_settings, 'JITSI_DOMAIN', '') or '').strip() or 'meet.jit.si'
        secret = (getattr(dj_settings, 'JITSI_APP_SECRET', '') or '').strip()

        # JWT only works on self-hosted Jitsi with prosody JWT plugin.
        # When using the public meet.jit.si or when secret is missing — skip JWT.
        token = None
        if secret and domain not in ('meet.jit.si',):
            try:
                token = JitsiService.create_room_token(
                    room=str(consultation.room_uuid),
                    display_name=display_name,
                    is_moderator=False,
                )
            except ImproperlyConfigured:
                token = None

        return Response({
            'valid': True,
            'room_name': str(consultation.room_uuid),
            'expires_at': consultation.expires_at,
            'jitsi_token': token,
            'jitsi_domain': domain,
            'display_name': display_name,
        })
