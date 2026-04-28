"""
Admin/staff routes — mounted at /api/education/ (see config/urls.py).
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CFStreamWebhookView,
    ConsultationAdminViewSet,
    EducationStatsView,
    LessonAdminViewSet,
    LiveStreamAdminViewSet,
)


router = DefaultRouter()
router.register(r'lessons', LessonAdminViewSet, basename='education-lesson')
router.register(r'streams', LiveStreamAdminViewSet, basename='education-stream')
router.register(r'consultations', ConsultationAdminViewSet, basename='education-consultation')

urlpatterns = [
    path('', include(router.urls)),
    path('stats/', EducationStatsView.as_view(), name='education-stats'),
    path('webhooks/cf-stream/', CFStreamWebhookView.as_view(), name='cf-stream-webhook'),
]
