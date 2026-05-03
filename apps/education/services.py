"""
EducationService — wrappers around Cloudflare Stream API, Cloudflare R2 (boto3),
and Jitsi JWT.

Implementation notes:
- All HTTP/SDK calls live HERE — views must NOT touch CF/R2 directly.
- boto3 / requests / jwt are imported lazily so the project boots even
  if some packages are missing in dev environments.
- Methods raise ImproperlyConfigured (not NotImplementedError) when
  credentials are missing, so callers can return 503 cleanly.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Optional

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from apps.clients.models import Client

from .models import Lesson


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Access control (pure logic, no external calls)
# ---------------------------------------------------------------------------

class LessonAccessService:
    """Decides whether a given client can access a given lesson.

    Rules (OR-combined):
      1. The lesson is explicitly attached to the client's group.
      2. The lesson's subscription_tags intersect with the group's
         online_subscription_tags.
    """

    @staticmethod
    def can_client_access(lesson: Lesson, client: Client) -> bool:
        if not lesson.is_published or lesson.deleted_at:
            return False

        if client.group_id and lesson.groups.filter(id=client.group_id).exists():
            return True

        if client.group and getattr(client.group, 'online_subscription_tags', None):
            client_tags = set(client.group.online_subscription_tags or [])
            lesson_tags = set(lesson.subscription_tags or [])
            if client_tags & lesson_tags:
                return True

        return False


# ---------------------------------------------------------------------------
# Cloudflare Stream — videos and live inputs
# ---------------------------------------------------------------------------

class CloudflareStreamService:
    """Wrapper over Cloudflare Stream REST API."""

    BASE_URL = 'https://api.cloudflare.com/client/v4'

    @classmethod
    def _account_id(cls) -> str:
        v = getattr(settings, 'CF_STREAM_ACCOUNT_ID', '') or ''
        if not v:
            raise ImproperlyConfigured('CF_STREAM_ACCOUNT_ID is not set.')
        return v

    @classmethod
    def _token(cls) -> str:
        v = getattr(settings, 'CF_STREAM_API_TOKEN', '') or ''
        if not v:
            raise ImproperlyConfigured('CF_STREAM_API_TOKEN is not set.')
        return v

    @classmethod
    def _customer(cls) -> str:
        v = getattr(settings, 'CF_STREAM_CUSTOMER', '') or ''
        if not v:
            raise ImproperlyConfigured('CF_STREAM_CUSTOMER is not set.')
        return v

    @classmethod
    def _headers(cls) -> dict:
        return {
            'Authorization': f'Bearer {cls._token()}',
            'Content-Type': 'application/json',
        }

    # --- Recorded videos: direct upload ---

    @classmethod
    def create_direct_upload_url(
        cls, max_duration_sec: int = 14400, name: str = '',
    ) -> dict:
        """Initiate a CF Stream direct creator upload (non-TUS).

        Returns {'upload_url': str, 'video_uid': str}.
        Frontend does a simple POST to upload_url with the video binary as body
        (Content-Type: video/mp4). Cloudflare handles transcoding.

        Raises HTTPError on quota exceeded (error code 10011) or other CF errors.
        """
        import requests

        url = f"{cls.BASE_URL}/accounts/{cls._account_id()}/stream/direct_upload"
        body = {
            'maxDurationSeconds': max_duration_sec,
            'meta': {'name': name or 'lesson'},
            'requireSignedURLs': False,
        }
        resp = requests.post(url, headers=cls._headers(), json=body, timeout=20)
        resp.raise_for_status()
        result = resp.json().get('result', {})
        upload_url = result.get('uploadURL', '')
        video_uid = result.get('uid', '')
        if not upload_url or not video_uid:
            raise RuntimeError(
                f'CF Stream did not return upload URL: {resp.json()}'
            )
        return {'upload_url': upload_url, 'video_uid': video_uid}

    # --- Signed HLS playback ---

    @classmethod
    def create_signed_playback_url(
        cls,
        video_uid: str,
        client_id: str,
        ttl_seconds: int = 4 * 3600,
    ) -> str:
        """Issue a signed JWT locally using the RSA signing key; return HLS URL.

        Uses local RS256 signing (no API call) as documented by Cloudflare:
        https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/
        """
        import base64
        import json
        import jwt  # PyJWT
        from jwt.algorithms import RSAAlgorithm

        key_id = getattr(settings, 'CF_STREAM_SIGNING_KEY_ID', '') or ''
        jwk_b64 = getattr(settings, 'CF_STREAM_SIGNING_JWK', '') or ''
        if not key_id or not jwk_b64:
            raise ImproperlyConfigured(
                'CF_STREAM_SIGNING_KEY_ID and CF_STREAM_SIGNING_JWK must be set.'
            )

        # JWK may be base64-encoded JSON or raw JSON
        try:
            jwk_str = base64.b64decode(jwk_b64 + '==').decode('utf-8')
            json.loads(jwk_str)  # validate it's JSON
        except Exception:
            jwk_str = jwk_b64  # treat as raw JSON string

        private_key = RSAAlgorithm.from_jwk(jwk_str)

        now = datetime.now(dt_timezone.utc)
        payload = {
            'sub': video_uid,
            'kid': key_id,
            'iat': int(now.timestamp()),
            'nbf': int(now.timestamp()) - 30,
            'exp': int((now + timedelta(seconds=ttl_seconds)).timestamp()),
            # Bind token to this viewer (logged for piracy auditing)
            'id': str(client_id),
            'downloadable': False,
            'accessRules': [{'type': 'any', 'action': 'allow'}],
        }
        token = jwt.encode(
            payload,
            private_key,
            algorithm='RS256',
            headers={'kid': key_id},
        )
        return f'https://{cls._customer()}.cloudflarestream.com/{token}/manifest/video.m3u8'

    # --- Live inputs ---

    @classmethod
    def create_live_input(cls, name: str) -> dict:
        """Create a live input with auto-recording on.

        Returns {'uid', 'rtmp_url', 'stream_key', 'playback_id'}.
        """
        import requests

        url = f"{cls.BASE_URL}/accounts/{cls._account_id()}/stream/live_inputs"
        body = {
            'meta': {'name': name or 'stream'},
            'recording': {
                'mode': 'automatic',  # ← key: auto-save the live as a video
                'requireSignedURLs': False,
                'allowedOrigins': [],
            },
        }
        resp = requests.post(url, headers=cls._headers(), json=body, timeout=15)
        resp.raise_for_status()
        result = resp.json().get('result', {})
        uid = result.get('uid', '')
        rtmps = result.get('rtmps', {}) or {}
        srt = result.get('srt', {}) or {}
        webrtc = result.get('webRTC', {}) or {}
        webrtc_playback = result.get('webRTCPlayback', {}) or {}
        webrtc_playback_url = webrtc_playback.get('url', '')

        # Debug: log full response keys
        import logging
        logger = logging.getLogger(__name__)
        logger.info('CF live_input response keys: %s', list(result.keys()))
        logger.info('webRTCPlayback: %s', webrtc_playback)

        if not webrtc_playback_url and uid:
            sub = getattr(settings, 'CF_STREAM_CUSTOMER', '').strip()
            if sub:
                webrtc_playback_url = f'https://{sub}.cloudflarestream.com/{uid}/webRTC/play'
        return {
            'uid': uid,
            'rtmp_url': rtmps.get('url', ''),
            'stream_key': rtmps.get('streamKey', ''),
            'playback_id': uid,  # for live, the input UID is the playback id
            # Browser / mobile streaming (WHIP protocol)
            'webrtc_url': webrtc.get('url', ''),
            # WebRTC playback URL (WHEP protocol — for students to watch live)
            'webrtc_playback_url': webrtc_playback_url,
            # SRT (Larix Broadcaster etc.)
            'srt_url': srt.get('url', ''),
            'srt_passphrase': srt.get('passphrase', ''),
        }

    # --- Live input → video lookup (for manual_archive fallback) ---

    @classmethod
    def find_latest_recording(cls, live_input_uid: str) -> str:
        """Query CF Stream for videos produced by a given live input.

        Returns the UID of the most recent ready-to-stream recording,
        or '' if none yet ready. Use `list_recordings()` if you need
        full state info (e.g. for showing "still processing").
        """
        for v in cls.list_recordings(live_input_uid):
            if v.get('readyToStream', False):
                return v.get('uid', '')
        return ''

    @classmethod
    def list_recordings(cls, live_input_uid: str) -> list:
        """Return ALL videos for a live input with their full state.

        Each item: {'uid', 'readyToStream', 'status': {'state', 'pctComplete'}, ...}
        State values: 'queued', 'inprogress', 'ready', 'error', 'pendingupload',
        'downloading', 'live-inprogress' (still being recorded).
        """
        import requests
        if not live_input_uid:
            return []
        url = (
            f"{cls.BASE_URL}/accounts/{cls._account_id()}/stream/live_inputs/"
            f"{live_input_uid}/videos"
        )
        try:
            resp = requests.get(url, headers=cls._headers(), timeout=15)
            resp.raise_for_status()
        except Exception:
            logger.warning('CF Stream list_recordings failed', exc_info=True)
            return []
        return resp.json().get('result') or []

    @classmethod
    def get_live_input_status(cls, live_input_uid: str) -> dict:
        """Get current state of a live input — whether it's actively receiving data.

        Returns: {
            'state': 'connected'|'disconnected'|'unknown',
            'last_seen_at': iso timestamp or '',
            'recordings_count': int,
            'has_ready_recording': bool,
        }
        """
        import requests
        if not live_input_uid:
            return {'state': 'unknown', 'last_seen_at': '', 'recordings_count': 0, 'has_ready_recording': False}
        url = f"{cls.BASE_URL}/accounts/{cls._account_id()}/stream/live_inputs/{live_input_uid}"
        try:
            resp = requests.get(url, headers=cls._headers(), timeout=15)
            resp.raise_for_status()
            r = resp.json().get('result') or {}
        except Exception:
            logger.warning('CF Stream get_live_input_status failed', exc_info=True)
            return {'state': 'unknown', 'last_seen_at': '', 'recordings_count': 0, 'has_ready_recording': False}
        # CF returns 'status' object on live input with 'current' state
        status_obj = r.get('status') or {}
        current = (status_obj.get('current') or {})
        state_raw = current.get('state', '')  # 'connected', 'disconnected', etc.

        recordings = cls.list_recordings(live_input_uid)
        return {
            'state': state_raw or 'unknown',
            'last_seen_at': current.get('statusLastSeen', ''),
            'recordings_count': len(recordings),
            'has_ready_recording': any(v.get('readyToStream', False) for v in recordings),
            'recordings': recordings,
        }

    # --- Webhook signature verification ---

    @classmethod
    def verify_webhook_signature(cls, body: bytes, header_value: str) -> bool:
        """Verify Cloudflare Stream webhook signature.

        Header format:  Webhook-Signature: time=1234567890,sig1=HEX_HMAC_SHA256
        HMAC payload:   f"{time}.{body_bytes}"
        """
        secret = getattr(settings, 'CF_STREAM_WEBHOOK_SECRET', '') or ''
        if not secret:
            raise ImproperlyConfigured('CF_STREAM_WEBHOOK_SECRET is not set.')
        if not header_value:
            return False

        parts = {}
        for token in header_value.split(','):
            if '=' in token:
                k, v = token.split('=', 1)
                parts[k.strip()] = v.strip()
        ts = parts.get('time')
        sig = parts.get('sig1')
        if not ts or not sig:
            return False

        signed_payload = f'{ts}.'.encode('utf-8') + body
        expected = hmac.new(
            secret.encode('utf-8'),
            signed_payload,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, sig)


# ---------------------------------------------------------------------------
# Cloudflare R2 — audio storage (S3-compatible)
# ---------------------------------------------------------------------------

class R2StorageService:
    """Wrapper over Cloudflare R2 via boto3 (S3-compatible client)."""

    @classmethod
    def _config_value(cls, name: str) -> str:
        v = getattr(settings, name, '') or ''
        if not v:
            raise ImproperlyConfigured(f'{name} is not set.')
        return v

    @classmethod
    def _client(cls):
        import boto3
        from botocore.config import Config

        account_id = cls._config_value('R2_ACCOUNT_ID')
        return boto3.client(
            's3',
            endpoint_url=f'https://{account_id}.r2.cloudflarestorage.com',
            aws_access_key_id=cls._config_value('R2_ACCESS_KEY_ID'),
            aws_secret_access_key=cls._config_value('R2_SECRET_ACCESS_KEY'),
            region_name='auto',
            config=Config(signature_version='s3v4'),
        )

    @classmethod
    def create_upload_presigned_url(
        cls,
        key: str,
        content_type: str = 'audio/mpeg',
        ttl_seconds: int = 3600,
    ) -> str:
        client = cls._client()
        return client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': cls._config_value('R2_BUCKET'),
                'Key': key,
                'ContentType': content_type,
            },
            ExpiresIn=ttl_seconds,
            HttpMethod='PUT',
        )

    @classmethod
    def create_download_presigned_url(
        cls, key: str, ttl_seconds: int = 4 * 3600,
    ) -> str:
        client = cls._client()
        return client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': cls._config_value('R2_BUCKET'),
                'Key': key,
            },
            ExpiresIn=ttl_seconds,
        )


# ---------------------------------------------------------------------------
# Jitsi — 1-on-1 consultations
# ---------------------------------------------------------------------------

class JitsiService:
    """Mints a JWT used by the Jitsi web client to join a moderated room."""

    @classmethod
    def _config_value(cls, name: str) -> str:
        v = getattr(settings, name, '') or ''
        if not v:
            raise ImproperlyConfigured(f'{name} is not set.')
        return v

    @classmethod
    def create_room_token(
        cls,
        room: str,
        display_name: str,
        is_moderator: bool = False,
        ttl_seconds: int = 4 * 3600,
        avatar_url: Optional[str] = None,
        email: str = '',
    ) -> str:
        """Return a HS256-signed Jitsi JWT.

        Jitsi expects a JWT with audience='jitsi', issuer=app_id,
        subject=domain, room=<name or '*'>, and a `context.user` block.
        """
        import jwt

        domain = cls._config_value('JITSI_DOMAIN')
        app_id = cls._config_value('JITSI_APP_ID')
        secret = cls._config_value('JITSI_APP_SECRET')

        now = datetime.now(dt_timezone.utc)
        # Modern Jitsi (8.x+) reads moderator status from `context.user.affiliation`
        # ('owner' = moderator, 'member' = participant). Older versions used
        # `moderator: 'true'/'false'`. We set BOTH fields for compatibility.
        # We also add `kicked: 'true'`-equivalent restrictions via features so
        # students can't take moderator-only actions even if Jitsi misroutes.
        affiliation = 'owner' if is_moderator else 'member'
        payload = {
            'aud': 'jitsi',
            'iss': app_id,
            'sub': domain,
            'room': room,
            'iat': int(now.timestamp()),
            'nbf': int(now.timestamp()) - 30,
            'exp': int((now + timedelta(seconds=ttl_seconds)).timestamp()),
            'context': {
                'user': {
                    'name': display_name,
                    'email': email,
                    'avatar': avatar_url or '',
                    'moderator': 'true' if is_moderator else 'false',
                    'affiliation': affiliation,
                    'role': 'moderator' if is_moderator else 'participant',
                },
                'features': {
                    # Moderator-only features — explicitly disabled for students
                    'recording': 'true' if is_moderator else 'false',
                    'livestreaming': 'true' if is_moderator else 'false',
                    'transcription': 'false',
                    'outbound-call': 'false',
                    # Allowed for everyone
                    'screen-sharing': 'true',
                },
            },
            # Top-level `moderator` claim (some Jitsi forks check here)
            'moderator': is_moderator,
        }
        return jwt.encode(payload, secret, algorithm='HS256')
