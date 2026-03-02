from django.urls import path

from .views import (
    LoginView,
    DashboardView,
    ClientRegisterView,
    ClientListView,
    ClientDetailView,
)

urlpatterns = [
    path('', LoginView.as_view(), name='login'),
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    path('clients/', ClientListView.as_view(), name='client-list'),
    path('clients/register/', ClientRegisterView.as_view(), name='client-register'),
    path('clients/<str:client_id>/', ClientDetailView.as_view(), name='client-detail'),
]
