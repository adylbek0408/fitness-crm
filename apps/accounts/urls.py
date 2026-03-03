from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from apps.accounts.views import CustomTokenObtainPairView, UserMeView, ManagerViewSet


router = DefaultRouter()
router.register('managers', ManagerViewSet, basename='manager')

urlpatterns = [
    path('token/', CustomTokenObtainPairView.as_view()),
    path('token/refresh/', TokenRefreshView.as_view()),
    path('me/', UserMeView.as_view()),
    path('', include(router.urls)),
]
