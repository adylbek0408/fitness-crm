from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from apps.accounts.views import CustomTokenObtainPairView, UserMeView

urlpatterns = [
    path('token/', CustomTokenObtainPairView.as_view()),
    path('token/refresh/', TokenRefreshView.as_view()),
    path('me/', UserMeView.as_view()),
]
