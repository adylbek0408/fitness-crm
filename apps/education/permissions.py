"""
Permissions for the education module.

Two auth contexts:
- Staff (Django User) — uses simplejwt → for /api/education/*.
- Cabinet (Client) — uses CabinetJWTAuthentication from apps.clients →
  for /api/cabinet/education/*.
"""
from rest_framework.permissions import BasePermission

from apps.clients.models import ClientAccount


class IsTeacherOrAdmin(BasePermission):
    """Staff-only access. role in {'admin', 'registrar'} or is_superuser."""

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        if getattr(user, 'is_superuser', False):
            return True
        return getattr(user, 'role', None) in ('admin', 'registrar')


class IsCabinetClient(BasePermission):
    """Mirror of apps.clients.cabinet_permissions.IsCabinetClient.

    Re-declared here to keep the education module self-contained;
    the auth class itself is reused (apps.clients.cabinet_auth.CabinetJWTAuthentication).
    """

    def has_permission(self, request, view):
        return isinstance(getattr(request, 'user', None), ClientAccount)


class IsLessonAccessible(BasePermission):
    """Object-level: only allow if the lesson is visible to the cabinet client."""

    def has_object_permission(self, request, view, obj):
        from .services import LessonAccessService
        account = request.user
        if not isinstance(account, ClientAccount):
            return False
        return LessonAccessService.can_client_access(obj, account.client)
