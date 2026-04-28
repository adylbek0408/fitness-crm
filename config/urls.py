from django.conf import settings
from django.conf.urls.static import static
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from apps.trainers.views import TrainerViewSet
from apps.groups.views import GroupViewSet
from apps.clients.views import ClientViewSet
from apps.attendance.views import AttendanceViewSet
from apps.statistics.views import StatisticsViewSet
from apps.education.cabinet_views import PublicConsultationView

router = DefaultRouter()
router.register(r'statistics', StatisticsViewSet, basename='statistics')
router.register(r'trainers', TrainerViewSet, basename='trainer')
router.register(r'groups', GroupViewSet, basename='group')
router.register(r'clients', ClientViewSet, basename='client')
router.register(r'attendance', AttendanceViewSet, basename='attendance')

urlpatterns = [
    path('api/', include(router.urls)),
    path('api/accounts/', include('apps.accounts.urls')),
    path('api/payments/', include('apps.payments.urls')),
    path('api/bonuses/', include('apps.clients.bonus_urls')),
    path('api/cabinet/', include('apps.clients.cabinet_urls')),
    path('api/cabinet/education/', include('apps.education.cabinet_urls')),
    path('api/education/', include('apps.education.urls')),
    path('api/consultation/<uuid:room_uuid>/',
         PublicConsultationView.as_view(),
         name='public-consultation'),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
