from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.clients.bonus_views import BonusViewSet

router = DefaultRouter()
router.register(r'', BonusViewSet, basename='bonus')

urlpatterns = [
    path('', include(router.urls)),
]
