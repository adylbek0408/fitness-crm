"""
Cabinet (student) routes — mounted at /api/cabinet/education/ (see config/urls.py).

Frontend axios interceptor automatically attaches the cabinet token to any
URL starting with /cabinet/* — that's why these routes live under that prefix.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .cabinet_views import (
    CabinetLessonViewSet,
    CabinetStreamHeartbeatView,
    CabinetStreamJoinView,
    CabinetStreamView,
    CabinetStreamViewersView,
)


router = DefaultRouter()
router.register(r'lessons', CabinetLessonViewSet, basename='cabinet-education-lesson')

urlpatterns = [
    path('', include(router.urls)),
    path('streams/active/', CabinetStreamView.as_view(), name='cabinet-stream-active'),
    path('streams/<uuid:pk>/join/', CabinetStreamJoinView.as_view(), name='cabinet-stream-join'),
    path('streams/<uuid:pk>/heartbeat/', CabinetStreamHeartbeatView.as_view(), name='cabinet-stream-heartbeat'),
    path('streams/<uuid:pk>/viewers/', CabinetStreamViewersView.as_view(), name='cabinet-stream-viewers'),
]
