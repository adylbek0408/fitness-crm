from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.statistics.views import StatisticViewSet

router = DefaultRouter()
router.register(r'', StatisticViewSet, basename='statistic')

urlpatterns = [
    path('', include(router.urls)),
]
