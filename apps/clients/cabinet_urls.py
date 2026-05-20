from django.urls import path
from apps.clients.cabinet_views import (
    CabinetLoginView, CabinetMeView, CabinetAttendanceView, CabinetGoogleAuthView,
)

urlpatterns = [
    path('login/', CabinetLoginView.as_view()),
    path('google-auth/', CabinetGoogleAuthView.as_view()),
    path('me/', CabinetMeView.as_view()),
    path('attendance/', CabinetAttendanceView.as_view()),
]
