from rest_framework.permissions import BasePermission


def _is_admin(user):
    """Superuser всегда считается admin, даже если role не выставлена."""
    return user.is_authenticated and (user.is_superuser or user.role == 'admin')


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return _is_admin(request.user)


class IsRegistrar(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'registrar'


class IsAdminOrRegistrar(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            _is_admin(request.user) or request.user.role == 'registrar'
        )
