from rest_framework.permissions import BasePermission

from apps.clients.models import ClientAccount


class IsCabinetClient(BasePermission):
    """Only allow requests authenticated via CabinetJWTAuthentication (request.user is ClientAccount)."""
    def has_permission(self, request, view):
        return isinstance(getattr(request, 'user', None), ClientAccount)
