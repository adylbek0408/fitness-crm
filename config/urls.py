from django.conf import settings
from django.conf.urls.static import static
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from apps.trainers.views import TrainerViewSet
from apps.groups.views import GroupViewSet
from apps.clients.views import ClientViewSet
from apps.payments.views import FullPaymentViewSet, InstallmentPlanViewSet
from apps.attendance.views import AttendanceViewSet
from apps.statistics.views import StatisticsViewSet

router = DefaultRouter()
router.register(r'statistics', StatisticsViewSet, basename='statistics')
router.register(r'trainers', TrainerViewSet, basename='trainer')
router.register(r'groups', GroupViewSet, basename='group')
router.register(r'clients', ClientViewSet, basename='client')
router.register(r'payments/full', FullPaymentViewSet, basename='full-payment')
router.register(r'payments/installment', InstallmentPlanViewSet, basename='installment-plan')
router.register(r'attendance', AttendanceViewSet, basename='attendance')

urlpatterns = [
    path('admin-panel/', include('apps.admin_panel.urls')),
    path('mobile/', include('apps.frontend.urls')),
    path('api/', include(router.urls)),
    path('api/accounts/', include('apps.accounts.urls')),
]

if settings.DEBUG:
    try:
        import debug_toolbar
        urlpatterns = [path('__debug__/', include(debug_toolbar.urls))] + urlpatterns
    except ImportError:
        pass

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
