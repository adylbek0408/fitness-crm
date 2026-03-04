"""
Cabinet JWT: tokens with payload { client_id, type: 'cabinet', exp, iat }.
Used for client personal cabinet auth (separate from staff JWT).
"""
import jwt
from django.conf import settings
from rest_framework import authentication, exceptions

from apps.clients.models import Client, ClientAccount


CABINET_TOKEN_TYPE = 'cabinet'


def create_cabinet_tokens(client):
    """Return dict with access_token and refresh_token for the client."""
    from datetime import datetime, timedelta
    from django.conf import settings as django_settings
    payload_access = {
        'client_id': str(client.id),
        'type': CABINET_TOKEN_TYPE,
        'exp': datetime.utcnow() + timedelta(hours=12),
        'iat': datetime.utcnow(),
    }
    payload_refresh = {
        'client_id': str(client.id),
        'type': CABINET_TOKEN_TYPE,
        'token_type': 'refresh',
        'exp': datetime.utcnow() + timedelta(days=30),
        'iat': datetime.utcnow(),
    }
    secret = getattr(settings, 'SECRET_KEY', django_settings.SECRET_KEY)
    return {
        'access': jwt.encode(payload_access, secret, algorithm='HS256'),
        'refresh': jwt.encode(payload_refresh, secret, algorithm='HS256'),
    }


class CabinetJWTAuthentication(authentication.BaseAuthentication):
    """Expects Bearer token with cabinet JWT; sets request.client and request.client_account."""
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
            client = Client.objects.get(id=client_id)
            account = client.cabinet_account
        except (Client.DoesNotExist, ClientAccount.DoesNotExist):
            raise exceptions.AuthenticationFailed('Client not found.')
        return (account, token)
