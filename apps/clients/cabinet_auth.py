"""
Cabinet JWT: tokens with payload { client_id, type: 'cabinet', session_key, exp, iat }.
Used for client personal cabinet auth (separate from staff JWT).

Session enforcement: each new login generates a fresh session_key that is stored in
ClientAccount and embedded in the JWT. On every request, we compare the token's
session_key to the stored one — a mismatch means a newer login has happened and the
old token is rejected. This ensures that only one active session exists at a time.
"""
import secrets

import jwt
from django.conf import settings
from rest_framework import authentication, exceptions

from apps.clients.models import Client, ClientAccount


CABINET_TOKEN_TYPE = 'cabinet'


def create_cabinet_tokens(client):
    """Return dict with access_token and refresh_token for the client.

    Rotates the session_key in ClientAccount so all older tokens become
    invalid immediately.
    """
    from datetime import timedelta, timezone as dt_tz
    from datetime import datetime as _dt
    from django.conf import settings as django_settings

    now = _dt.now(dt_tz.utc)
    new_session_key = secrets.token_urlsafe(32)

    # Rotate session key — invalidates all existing tokens for this client
    ClientAccount.objects.filter(client_id=client.id).update(session_key=new_session_key)

    payload_access = {
        'client_id': str(client.id),
        'type': CABINET_TOKEN_TYPE,
        'session_key': new_session_key,
        'exp': now + timedelta(days=30),
        'iat': now,
    }
    payload_refresh = {
        'client_id': str(client.id),
        'type': CABINET_TOKEN_TYPE,
        'token_type': 'refresh',
        'session_key': new_session_key,
        'exp': now + timedelta(days=30),
        'iat': now,
    }
    secret = getattr(settings, 'SECRET_KEY', django_settings.SECRET_KEY)
    return {
        'access': jwt.encode(payload_access, secret, algorithm='HS256'),
        'refresh': jwt.encode(payload_refresh, secret, algorithm='HS256'),
    }


class CabinetJWTAuthentication(authentication.BaseAuthentication):
    """Expects Bearer token with cabinet JWT; sets request.user to the ClientAccount."""
    keyword = 'Bearer'

    def authenticate(self, request):
        auth = authentication.get_authorization_header(request).split()
        if not auth or auth[0].decode() != self.keyword:
            return None
        if len(auth) != 2:
            raise exceptions.AuthenticationFailed('Invalid token header.')
        token = auth[1].decode()
        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=['HS256'],
            )
        except jwt.ExpiredSignatureError:
            raise exceptions.AuthenticationFailed('Token expired.')
        except jwt.InvalidTokenError:
            raise exceptions.AuthenticationFailed('Invalid token.')
        if payload.get('type') != CABINET_TOKEN_TYPE:
            raise exceptions.AuthenticationFailed('Invalid token type.')
        client_id = payload.get('client_id')
        if not client_id:
            raise exceptions.AuthenticationFailed('Invalid token.')
        try:
            # Reject soft-deleted clients — even with a still-valid JWT they
            # must lose access the moment an admin deletes them.
            client = Client.objects.get(id=client_id, deleted_at__isnull=True)
            account = client.cabinet_account
        except (Client.DoesNotExist, ClientAccount.DoesNotExist):
            raise exceptions.AuthenticationFailed('Client not found.')

        # Session enforcement: once the account has a stored session_key (set on
        # first login after the migration), the token MUST carry the matching key.
        # Accounts that have never logged in post-migration have session_key = ''
        # and are exempt until their first new login — this preserves backwards
        # compatibility for existing tokens while still enforcing single-session
        # behaviour for everyone who logs in going forward.
        stored_session = account.session_key or ''
        if stored_session:
            token_session = payload.get('session_key', '')
            if token_session != stored_session:
                raise exceptions.AuthenticationFailed('Session expired. Please log in again.')

        return (account, token)
