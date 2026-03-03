from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.groups.views import GroupViewSet

router = DefaultRouter()
router.register(r'', GroupViewSet, basename='group')

# Fix UUID lookup
GroupViewSet.lookup_value_regex = r'[0-9a-f-]{36}'

urlpatterns = [
    path('', include(router.urls)),
]
