from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.response import Response
from rest_framework import status

from core.exceptions import ValidationError, NotFoundError, PermissionDeniedError


def custom_exception_handler(exc, context):
    if isinstance(exc, ValidationError):
        return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    if isinstance(exc, NotFoundError):
        return Response({'detail': str(exc)}, status=status.HTTP_404_NOT_FOUND)
    if isinstance(exc, PermissionDeniedError):
        return Response({'detail': str(exc)}, status=status.HTTP_403_FORBIDDEN)

    return drf_exception_handler(exc, context)
