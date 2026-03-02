from django.urls import path

from .views import (
    AdminLoginView,
    AdminDashboardView,
    TrainerListView,
    TrainerFormView,
    GroupListView,
    GroupFormView,
    ClientListView,
    ClientDetailView,
    StatisticsView,
)

urlpatterns = [
    path('', AdminLoginView.as_view(), name='admin-login'),
    path('dashboard/', AdminDashboardView.as_view(), name='admin-dashboard'),
    path('trainers/', TrainerListView.as_view(), name='admin-trainers'),
    path('trainers/add/', TrainerFormView.as_view(), name='admin-trainer-add'),
    path('trainers/<str:trainer_id>/', TrainerFormView.as_view(), name='admin-trainer-edit'),
    path('groups/', GroupListView.as_view(), name='admin-groups'),
    path('groups/add/', GroupFormView.as_view(), name='admin-group-add'),
    path('groups/<str:group_id>/', GroupFormView.as_view(), name='admin-group-edit'),
    path('clients/', ClientListView.as_view(), name='admin-clients'),
    path('clients/<str:client_id>/', ClientDetailView.as_view(), name='admin-client-detail'),
    path('statistics/', StatisticsView.as_view(), name='admin-statistics'),
]
