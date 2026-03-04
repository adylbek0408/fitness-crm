from django.urls import path
from apps.clients.cabinet_views import CabinetLoginView, CabinetMeView

urlpatterns = [
    path('login/', CabinetLoginView.as_view()),
    path('me/', CabinetMeView.as_view()),
]
