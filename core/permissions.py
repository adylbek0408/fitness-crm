from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'admin'


class IsRegistrar(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'registrar'


class IsAttendanceManager(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'attendance_manager'


class IsAdminOrRegistrar(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ('admin', 'registrar')
