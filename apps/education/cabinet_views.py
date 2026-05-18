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
from django.db.models import Count, F, Q, Subquery
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.clients.cabinet_auth import CabinetJWTAuthentication

from .models import (
    Consultation, Lesson, LessonProgress, LiveStream,
    StreamChatMessage, StreamGuest, StreamViewer,
)
from .permissions import IsCabinetClient
from .serializers import (
    LessonProgressSerializer,
    LessonSerializer,
    LiveStreamSerializer,
    StreamChatMessageSerializer,
    StreamViewerSerializer,
)
from .services import (
    CloudflareStreamService,
    JitsiService,
    LessonAccessService,
    R2StorageService,
)


logger = logging.getLogger(__name__)


def _client_has_lesson_access(client):
    """Return True if the client is allowed to access lessons/streams.

    Installment clients who have not fully paid are blocked until their
    plan is fully closed (remaining <= 0).  Full-payment and
    non-installment clients always pass.
    """
    if client.payment_type != 'installment':
        return True
    plan = client.installment_plans.order_by('-created_at').first()
    if plan is None:
        return False
    return plan.is_closed


def _client_group_ids(client):
    """Return a list of group IDs this client belongs to (1 or 2 groups)."""
    ids = []
    if client.group_id:
        ids.append(client.group_id)
    if client.second_group_id:
        ids.append(client.second_group_id)
    return ids


def _ensure_stream_group_access(stream, client):
    """Raise Http404 if this client cannot interact with this stream.

    Same access rule used by /streams/active/: a stream restricted to
    specific groups is reachable only by clients in one of those groups.
    A stream with no groups assigned is open to everyone.

    Centralised so chat / guest / TURN / signaling endpoints can't drift
    out of sync — multiple of them used to skip this check entirely,
    letting a student in group A read or write into a stream meant for
    group B (and request TURN credentials for it).
    """
    from django.http import Http404
    if stream.groups.exists():
        group_ids = _client_group_ids(client)
        if not group_ids or not stream.groups.filter(id__in=group_ids).exists():
            raise Http404('No stream access for your group.')


# ---------------------------------------------------------------------------
# Lessons (read-only for students)
# ---------------------------------------------------------------------------

class CabinetLessonViewSet(viewsets.ReadOnlyModelViewSet):
    """List/detail of lessons accessible to the current cabinet client."""
    serializer_class = LessonSerializer
    authentication_classes = [CabinetJWTAuthentication]
    permission_classes = [IsCabinetClient]
    pagination_class = None

    def get_queryset(self):
        client = self.request.user.client
        group_ids = _client_group_ids(client)
        if not group_ids:
            return Lesson.objects.none()
        if not _client_has_lesson_access(client):
            return Lesson.objects.none()

        client_tags = list(getattr(client.group, 'online_subscription_tags', None) or [])
        if client.second_group_id:
            client_tags = list(set(client_tags) | set(
                getattr(client.second_group, 'online_subscription_tags', None) or []
            ))
        q = Q(groups__id__in=group_ids)
        # JSONField overlap is not portable across all DB backends; tag matching
        # is handled by the Python-side fallback below.
        qs = Lesson.objects.filter(
            is_published=True, deleted_at__isnull=True,
        ).filter(q).prefetch_related('groups').distinct()

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
        if ltype in ('video', 'audio', 'text'):
            qs = qs.filter(lesson_type=ltype)

        # Sprint 3.6 / 9.x — keep stream archives out of the regular lesson list.
        # Default (no source param) — manually uploaded lessons only;
        # `source=stream` — only stream recordings (CabinetArchive page);
        # `source=lesson` — explicit form of the default;
        # `source=all` — escape hatch for whoever needs the union.
        # NB: applied here so it affects `list`, but `retrieve` bypasses this
        # via the explicit override below — students opening a stream-archive
        # lesson by id (deep link from the Archive page) must still get a 200.
        # CF video UIDs of all stream recordings (for old rows missing the FK).
        _rec_uids = LiveStream.objects.filter(
            recording_uid__gt='', deleted_at__isnull=True,
        ).values('recording_uid')

        source = self.request.query_params.get('source', 'lesson')
        if source == 'stream':
            # Include both properly linked recordings AND old orphaned ones.
            qs = qs.filter(
                Q(source_streams__isnull=False) | Q(stream_uid__in=Subquery(_rec_uids))
            ).distinct()
        elif source != 'all':
            qs = qs.filter(source_streams__isnull=True).exclude(
                stream_uid__in=Subquery(_rec_uids)
            ).distinct()
        return qs.order_by('-published_at', '-created_at')

    def get_object(self):
        # Detail view must be reachable even when the lesson is a stream
        # recording — the source filter from `get_queryset` would otherwise
        # turn legitimate deep links into 404s. Re-run access checks on the
        # un-filtered base queryset.
        client = self.request.user.client
        if not _client_group_ids(client) or not _client_has_lesson_access(client):
            from django.http import Http404
            raise Http404
        from rest_framework.generics import get_object_or_404
        qs = Lesson.objects.filter(is_published=True, deleted_at__isnull=True)
        lesson = get_object_or_404(qs, pk=self.kwargs[self.lookup_field])
        if not LessonAccessService.can_client_access(lesson, client):
            from django.http import Http404
            raise Http404
        return lesson

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

        # Prev/next lesson IDs for in-player navigation.
        # Use keyset pagination against the queryset ordering (-published_at,
        # -created_at) so we never load all lesson IDs into memory.
        try:
            nav_qs = self.filter_queryset(self.get_queryset())
            from django.db.models import Q as _Q
            pa, ca = lesson.published_at, lesson.created_at

            # "prev" in the list = newer item = published_at AFTER current
            prev_item = (
                nav_qs.filter(
                    _Q(published_at__gt=pa) |
                    _Q(published_at=pa, created_at__gt=ca)
                ).order_by('published_at', 'created_at').values('id', 'title').first()
            )
            # "next" in the list = older item = published_at BEFORE current
            next_item = (
                nav_qs.filter(
                    _Q(published_at__lt=pa) |
                    _Q(published_at=pa, created_at__lt=ca)
                ).order_by('-published_at', '-created_at').values('id', 'title').first()
            )

            data['prev_id']    = str(prev_item['id'])    if prev_item else None
            data['prev_title'] = prev_item['title']       if prev_item else None
            data['next_id']    = str(next_item['id'])    if next_item else None
            data['next_title'] = next_item['title']       if next_item else None
        except Exception:
            logger.warning('Failed to compute lesson nav for %s', lesson.id, exc_info=True)
            data['prev_id'] = data['prev_title'] = None
            data['next_id'] = data['next_title'] = None

        return Response(data)

    @action(detail=True, methods=['post'], url_path='progress')
    def progress(self, request, pk=None):
        lesson = self.get_object()
        client = request.user.client
        if not LessonAccessService.can_client_access(lesson, client):
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            position = max(0, int(request.data.get('position', 0)))
        except (TypeError, ValueError):
            position = 0
        try:
            percent = max(0, min(100, int(request.data.get('percent', 0))))
        except (TypeError, ValueError):
            percent = 0

        # Anti-fabrication: a client could otherwise POST {percent: 100,
        # position: 999} to mark a lesson "completed" without actually
        # watching. Cross-check against the lesson's known duration:
        #   - is_completed only when both numbers agree (≥95% watched AND
        #     position is at least ~90% of the recorded duration).
        #   - position cannot exceed duration (with a small grace).
        # If duration_sec is 0 (CF still transcoding, audio without
        # metadata) we cap progress at 50% provisionally — see below.
        # Text lessons have no playback duration — opening the lesson IS reading it.
        if lesson.lesson_type == 'text':
            percent = 100
            position = 0
            is_completed = True
        else:
            duration = lesson.duration_sec or 0
            if duration > 0:
                position = min(position, duration + 5)
                position_pct = (position / duration) * 100
                is_completed = (percent >= 95) and (position_pct >= 90)
                # Recompute percent from position so a client can't claim
                # progress beyond what the position would support.
                percent = min(percent, int(position_pct + 5))
            else:
                # No duration yet (CF still transcoding, or audio without metadata).
                # We CAN'T trust the client's percent flag — they could POST
                # {percent:100} the moment the lesson appears and be marked
                # "completed" without watching. Record progress up to 50% as a
                # provisional value; once `duration_sec` is filled in by the
                # webhook, the next genuine progress beat will correctly grade it.
                percent = min(percent, 50)
                is_completed = False

        # last_watched_at is auto_now in the model — ensure update_or_create
        # actually bumps it even when nothing else changed.
        from django.utils import timezone as _tz
        # get_or_create guards against duplicate INSERTs from two concurrent
        # requests (e.g. two browser tabs), but if both requests race past the
        # SELECT at the same millisecond, both attempt INSERT → IntegrityError.
        # The except clause handles that edge case gracefully.
        from django.db import IntegrityError as _IntegrityError
        try:
            progress, _ = LessonProgress.objects.get_or_create(
                client=client,
                lesson=lesson,
                defaults={'last_position_sec': 0, 'percent_watched': 0},
            )
        except _IntegrityError:
            progress = LessonProgress.objects.get(client=client, lesson=lesson)
        now = _tz.now()
        # Never let percent go backward (two-device race, seek-back, etc.)
        new_percent = max(progress.percent_watched, percent)
        # Once completed, stays completed — completion can't be un-rung.
        new_completed = progress.is_completed or is_completed
        # Record the first moment the lesson was completed.
        if new_completed and not progress.is_completed and not progress.completed_at:
            progress.completed_at = now
        progress.last_position_sec = position
        progress.percent_watched   = new_percent
        progress.is_completed      = new_completed
        progress.last_watched_at   = now
        progress.save(update_fields=[
            'last_position_sec', 'percent_watched', 'is_completed',
            'completed_at', 'last_watched_at',
        ])
        return Response(LessonProgressSerializer(progress).data)


# ---------------------------------------------------------------------------
# Live streams
# ---------------------------------------------------------------------------

def _build_stream_playback_url(stream: LiveStream) -> str:
    """HLS playback URL for a live input."""
    from django.conf import settings as dj_settings
    if not stream.cf_playback_id:
        return ''
    sub = getattr(dj_settings, 'CF_STREAM_CUSTOMER', '').strip()
    if sub:
        return f'https://{sub}.cloudflarestream.com/{stream.cf_playback_id}/manifest/video.m3u8'
    # Fallback: use account-level URL when customer subdomain is not configured.
    account = getattr(dj_settings, 'CF_STREAM_ACCOUNT_ID', '').strip()
    if account:
        return f'https://videodelivery.net/{stream.cf_playback_id}/manifest/video.m3u8'
    return ''


class CabinetStreamView(APIView):
    """GET /api/cabinet/education/streams/active/ — current live stream for client's group.
    Optional ?id=<uuid> to fetch a specific stream (if the client has access).
    """
    authentication_classes = [CabinetJWTAuthentication]
    permission_classes = [IsCabinetClient]

    def get(self, request):
        client = request.user.client

        if not _client_has_lesson_access(client):
            return Response({'stream': None, 'reason': 'payment_required'})

        stream_id = request.query_params.get('id')

        if stream_id:
            # Fetch specific stream by ID (for shareable links)
            try:
                stream = LiveStream.objects.get(pk=stream_id, deleted_at__isnull=True)
            except LiveStream.DoesNotExist:
                return Response({'stream': None, 'reason': 'not_found'})
            # Access check: stream must belong to client's group OR have no groups assigned
            group_ids = _client_group_ids(client)
            if stream.groups.exists() and (
                not group_ids
                or not stream.groups.filter(id__in=group_ids).exists()
            ):
                return Response({'stream': None, 'reason': 'forbidden'})
        else:
            # Auto-detect: find a live stream for this student.
            stream = None
            base_qs = LiveStream.objects.filter(status='live', deleted_at__isnull=True)
            group_ids = _client_group_ids(client)

            # Priority 1: stream assigned to one of the student's groups
            if group_ids:
                stream = base_qs.filter(groups__id__in=group_ids).order_by('-started_at').first()

            # Priority 2: stream with no groups assigned (available to everyone)
            if not stream:
                stream = (
                    base_qs
                    .annotate(group_count=Count('groups'))
                    .filter(group_count=0)
                    .order_by('-started_at')
                    .first()
                )

            if not stream:
                return Response({'stream': None})

        data = LiveStreamSerializer(stream).data
        # Always sign the playback URL: the live input is created with
        # requireSignedURLs=True so unsigned URLs return 401.
        signed = CloudflareStreamService.create_signed_live_urls(
            stream.cf_playback_id, str(client.id)
        )
        if stream.status == 'live' and stream.cf_webrtc_playback_url:
            data['playback_url'] = signed['webrtc_url']
            data['playback_kind'] = 'webrtc'
        else:
            data['playback_url'] = signed['hls_url']
            data['playback_kind'] = 'hls'
        return Response({'stream': data})


class CabinetStreamJoinView(APIView):
    authentication_classes = [CabinetJWTAuthentication]
    permission_classes = [IsCabinetClient]

    def post(self, request, pk):
        client = request.user.client
        if not _client_has_lesson_access(client):
            return Response({'detail': 'Оплата не завершена.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            stream = LiveStream.objects.get(pk=pk, status='live', deleted_at__isnull=True)
        except LiveStream.DoesNotExist:
            return Response({'detail': 'Stream not active.'},
                            status=status.HTTP_404_NOT_FOUND)
        # Access: stream must belong to one of student's groups OR have no groups (open stream)
        group_ids = _client_group_ids(client)
        if stream.groups.exists() and (
            not group_ids
            or not stream.groups.filter(id__in=group_ids).exists()
        ):
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

        viewer, created = StreamViewer.objects.get_or_create(
            stream=stream, client=client,
            defaults={'is_active': True},
        )
        if not created:
            StreamViewer.objects.filter(pk=viewer.pk).update(is_active=True, left_at=None)
            viewer.is_active = True
            viewer.left_at = None
        # Sign both HLS and WebRTC URLs — live input has requireSignedURLs=True.
        signed = CloudflareStreamService.create_signed_live_urls(
            stream.cf_playback_id, str(client.id)
        )
        if stream.cf_webrtc_playback_url:
            playback_url = signed['webrtc_url']
            playback_kind = 'webrtc'
        else:
            playback_url = signed['hls_url']
            playback_kind = 'hls'
        return Response({
            'viewer': StreamViewerSerializer(viewer).data,
            'playback_url': playback_url,
            'playback_kind': playback_kind,
            'watermark': {
                'text': (
                    f"{client.first_name or ''} {client.last_name or ''}".strip()
                    or 'Ученик'
                ),
            },
        })


class CabinetStreamHeartbeatView(APIView):
    authentication_classes = [CabinetJWTAuthentication]
    permission_classes = [IsCabinetClient]

    def post(self, request, pk):
        client = request.user.client
        if not _client_has_lesson_access(client):
            return Response({'detail': 'Оплата не завершена.'}, status=status.HTTP_403_FORBIDDEN)
        # Always validate stream is still live — an existing viewer row must
        # not keep incrementing heartbeats after the stream ends.
        try:
            stream = LiveStream.objects.get(pk=pk, status='live', deleted_at__isnull=True)
        except LiveStream.DoesNotExist:
            return Response({'detail': 'Stream not live.'}, status=status.HTTP_404_NOT_FOUND)

        viewer = StreamViewer.objects.filter(
            stream_id=pk, client=client, is_active=True,
        ).first()
        if not viewer:
            # No active viewer — try to revive an inactive one or create afresh.
            group_ids = _client_group_ids(client)
            if stream.groups.exists() and (
                not group_ids
                or not stream.groups.filter(id__in=group_ids).exists()
            ):
                return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)
            StreamViewer.objects.update_or_create(
                stream=stream, client=client,
                defaults={'is_active': True, 'left_at': None},
            )
            return Response({'ok': True, 'recreated': True})
        # Cheap rate limit: drop spammy beats without writing to DB.
        if viewer.last_heartbeat_at:
            since = (timezone.now() - viewer.last_heartbeat_at).total_seconds()
            if since < 2:
                return Response({'ok': True, 'throttled': True})
        viewer.save(update_fields=['last_heartbeat_at', 'updated_at'])
        return Response({'ok': True})


class CabinetStreamViewersView(APIView):
    """Who is currently watching the live stream (client requirement)."""
    authentication_classes = [CabinetJWTAuthentication]
    permission_classes = [IsCabinetClient]

    def get(self, request, pk):
        client = request.user.client
        if not _client_has_lesson_access(client):
            return Response({'detail': 'Оплата не завершена.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            stream = LiveStream.objects.get(pk=pk, deleted_at__isnull=True)
        except LiveStream.DoesNotExist:
            return Response({'detail': 'Not found.'},
                            status=status.HTTP_404_NOT_FOUND)
        # Access: stream must belong to one of student's groups OR have no groups (open stream)
        group_ids = _client_group_ids(client)
        if stream.groups.exists() and (
            not group_ids
            or not stream.groups.filter(id__in=group_ids).exists()
        ):
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

class ConsultationStatusView(APIView):
    """GET /api/consultation/{room_uuid}/status/
    Public. Returns current status without incrementing used_count.
    Used by the student's room to detect when the trainer stopped the call.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, room_uuid):
        try:
            c = Consultation.objects.get(room_uuid=room_uuid, deleted_at__isnull=True)
        except Consultation.DoesNotExist:
            return Response({'active': False, 'status': 'not_found'})

        # Auto-expire stale rows atomically — avoids overwriting a concurrent cancel.
        if c.expires_at and c.expires_at < timezone.now():
            Consultation.objects.filter(pk=c.pk, status='active').update(
                status='expired', updated_at=timezone.now(),
            )
            c.refresh_from_db(fields=['status'])

        # 'used' means used_count reached max_uses but the call is still ongoing.
        # Only 'cancelled' and 'expired' mean the session is truly over.
        return Response({
            'active': c.status in ('active', 'used'),
            'status': c.status,
        })


class PublicConsultationView(APIView):
    """GET /api/consultation/{room_uuid}/

    Public — opens with a link that the trainer sent over WhatsApp.
    Validates the link, increments used_count, and mints a Jitsi JWT.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, room_uuid):
        try:
            consultation = Consultation.objects.get(room_uuid=room_uuid, deleted_at__isnull=True)
        except Consultation.DoesNotExist:
            return Response({'valid': False, 'reason': 'not_found'},
                            status=status.HTTP_404_NOT_FOUND)

        # Auto-expire stale rows atomically — avoids overwriting a concurrent cancel.
        if consultation.expires_at and consultation.expires_at < timezone.now():
            Consultation.objects.filter(pk=consultation.pk, status='active').update(
                status='expired', updated_at=timezone.now(),
            )
            consultation.refresh_from_db(fields=['status'])

        # Allow 'used' consultations when the call hasn't been explicitly ended
        # (ended_at is None = trainer hasn't pressed Stop yet).
        # This lets students rejoin after a network drop without getting locked out.
        still_ongoing = consultation.status == 'used' and consultation.ended_at is None
        if not still_ongoing and not consultation.is_consumable:
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

        # Mark first-join time only. We deliberately don't increment
        # used_count or auto-flip to 'used' here — the link must survive
        # legitimate refreshes / reconnects (network blips, mobile sleep,
        # student leaving and coming back). The trainer ends the call with
        # the explicit "Завершить" button.
        # Atomic first-join timestamp — two concurrent requests can't both win.
        if not consultation.started_at:
            Consultation.objects.filter(pk=consultation.pk, started_at__isnull=True).update(
                started_at=timezone.now(), updated_at=timezone.now(),
            )
            consultation.refresh_from_db(fields=['started_at'])

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


# ---------------------------------------------------------------------------
# Stream Chat (cabinet — students)
# ---------------------------------------------------------------------------

class CabinetStreamChatView(APIView):
    """GET: poll new messages. POST: student sends a message."""
    authentication_classes = [CabinetJWTAuthentication]
    permission_classes = [IsCabinetClient]

    def _stream(self, request, pk):
        from django.shortcuts import get_object_or_404
        from rest_framework.exceptions import PermissionDenied
        client = request.user.client
        if not _client_has_lesson_access(client):
            raise PermissionDenied('Оплата не завершена.')
        stream = get_object_or_404(LiveStream, pk=pk, deleted_at__isnull=True)
        _ensure_stream_group_access(stream, client)
        return stream

    def get(self, request, pk):
        stream = self._stream(request, pk)
        after = request.query_params.get('after')
        try:
            limit = min(int(request.query_params.get('limit', 0) or 0), 200)
        except (ValueError, TypeError):
            limit = 0
        qs = StreamChatMessage.objects.filter(
            stream=stream, deleted_at__isnull=True,
        ).order_by('created_at')
        if after:
            from datetime import datetime
            try:
                parsed = datetime.fromisoformat(after.replace('Z', '+00:00'))
                qs = qs.filter(created_at__gt=parsed)
            except (ValueError, TypeError):
                pass
        elif limit > 0:
            tail = list(qs.order_by('-created_at')[:limit])
            tail.reverse()
            return Response(StreamChatMessageSerializer(tail, many=True).data)
        return Response(StreamChatMessageSerializer(qs, many=True).data)

    def post(self, request, pk):
        stream = self._stream(request, pk)
        client = request.user.client
        text = (request.data.get('text') or '').strip()
        if not text:
            return Response({'error': 'text required'}, status=400)
        if stream.status not in ('live', 'scheduled'):
            return Response({'error': 'stream not active'}, status=400)
        name = f'{client.first_name} {client.last_name}'.strip() or 'Ученик'
        msg = StreamChatMessage.objects.create(
            stream=stream,
            client=client,
            sender_name=name,
            text=text[:500],
        )
        return Response(StreamChatMessageSerializer(msg).data, status=201)


# ---------------------------------------------------------------------------
# Stream Guest — student side (check invite / accept)
# ---------------------------------------------------------------------------

class CabinetStreamGuestView(APIView):
    """GET: check invite. POST: accept (status=active). DELETE: leave stage."""
    authentication_classes = [CabinetJWTAuthentication]
    permission_classes = [IsCabinetClient]

    def _stream(self, request, pk):
        from django.shortcuts import get_object_or_404
        stream = get_object_or_404(LiveStream, pk=pk, deleted_at__isnull=True)
        _ensure_stream_group_access(stream, request.user.client)
        return stream

    def get(self, request, pk):
        self._stream(request, pk)  # access check
        client = request.user.client
        guest = StreamGuest.objects.filter(
            stream_id=pk,
            client=client,
            status__in=['invited', 'active'],
            deleted_at__isnull=True,
        ).first()
        if not guest:
            return Response({'invite': None})
        return Response({
            'invite': {
                'id': str(guest.id),
                'status': guest.status,
            }
        })

    def post(self, request, pk):
        self._stream(request, pk)  # access check
        client = request.user.client
        from django.shortcuts import get_object_or_404
        guest = get_object_or_404(
            StreamGuest,
            stream_id=pk,
            client=client,
            status='invited',
            deleted_at__isnull=True,
        )
        guest.status = 'active'
        guest.save(update_fields=['status'])
        return Response({'id': str(guest.id), 'status': 'active'})

    def delete(self, request, pk):
        self._stream(request, pk)  # access check
        client = request.user.client
        StreamGuest.objects.filter(
            stream_id=pk,
            client=client,
            status__in=['invited', 'active'],
            deleted_at__isnull=True,
        ).update(status='ended', deleted_at=timezone.now())
        return Response(status=204)


class CabinetStreamTurnCredentialsView(APIView):
    """Generate short-lived Cloudflare TURN credentials for the guest side.

    Called by the student's browser before accepting the on-stage invite.
    POST → { iceServers: [...] }
    """
    authentication_classes = [CabinetJWTAuthentication]
    permission_classes = [IsCabinetClient]

    def post(self, request, pk):
        from django.shortcuts import get_object_or_404
        from django.core.cache import cache
        stream = get_object_or_404(LiveStream, pk=pk, deleted_at__isnull=True)
        _ensure_stream_group_access(stream, request.user.client)

        # Cache credentials per stream for 60 s — avoids hammering the CF API
        # if multiple students accept simultaneously or a client retries rapidly.
        cache_key = f'turn_creds_{pk}'
        cached = cache.get(cache_key)
        if cached:
            return Response({'iceServers': cached})

        import os, requests as req_lib
        key_id  = os.environ.get('CF_TURN_KEY_ID', '')
        key_tok = os.environ.get('CF_TURN_API_TOKEN', '')
        fallback = [
            {'urls': 'stun:stun.cloudflare.com:3478'},
            {'urls': 'stun:stun.l.google.com:19302'},
        ]
        if not key_id or not key_tok:
            return Response({'iceServers': fallback})
        try:
            resp = req_lib.post(
                f'https://rtc.live.cloudflare.com/v1/turn/keys/{key_id}/credentials/generate-ice-servers',
                headers={'Authorization': f'Bearer {key_tok}', 'Content-Type': 'application/json'},
                json={'ttl': 86400},
                timeout=5,
            )
            resp.raise_for_status()
            data = resp.json()
            ice = data.get('iceServers', {})
            ice_servers = [ice] if isinstance(ice, dict) else ice
            ice_servers = fallback + ice_servers
            cache.set(cache_key, ice_servers, 60)
            return Response({'iceServers': ice_servers})
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning('CF TURN credentials failed: %s', e)
            return Response({'iceServers': fallback})


class CabinetStreamGuestSignalView(APIView):
    """WebRTC signaling for guest side.

    GET → { offer_sdp, trainer_ice: [...], status }
    POST { answer_sdp } → store guest's answer
    POST { ice: {...} } → append ICE to guest_ice
    """
    authentication_classes = [CabinetJWTAuthentication]
    permission_classes = [IsCabinetClient]

    def _guest(self, request, pk):
        from django.shortcuts import get_object_or_404
        stream = get_object_or_404(LiveStream, pk=pk, deleted_at__isnull=True)
        _ensure_stream_group_access(stream, request.user.client)
        return get_object_or_404(
            StreamGuest,
            stream_id=pk,
            client=request.user.client,
            status='active',
            deleted_at__isnull=True,
        )

    def get(self, request, pk):
        guest = self._guest(request, pk)
        return Response({
            'status':       guest.status,
            'offer_sdp':    guest.offer_sdp,
            'trainer_ice':  guest.trainer_ice or [],
        })

    def post(self, request, pk):
        guest = self._guest(request, pk)
        data = request.data or {}
        # SDP and ICE candidate size limits — without them an attacker (or a
        # buggy client) could push megabytes of garbage into a JSONField row
        # and OOM the worker on the next read. Real WebRTC SDPs are <16 KB,
        # real ICE candidates <1 KB.
        if 'answer_sdp' in data:
            sdp = data['answer_sdp'] or ''
            if not isinstance(sdp, str) or len(sdp) > 32_000:
                return Response({'error': 'SDP too large'}, status=400)
            guest.answer_sdp = sdp
            guest.save(update_fields=['answer_sdp'])
        if 'ice' in data and data['ice']:
            cand = data['ice']
            try:
                import json as _json
                if len(_json.dumps(cand)) > 4_000:
                    return Response({'error': 'ICE candidate too large'}, status=400)
            except (TypeError, ValueError):
                return Response({'error': 'invalid ICE'}, status=400)
            ice_list = list(guest.guest_ice or [])
            # Cap accumulated candidates — typical session has <50.
            if len(ice_list) >= 200:
                return Response({'error': 'too many ICE candidates'}, status=429)
            ice_list.append(cand)
            guest.guest_ice = ice_list
            guest.save(update_fields=['guest_ice'])
        return Response({'ok': True})
