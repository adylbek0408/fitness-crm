from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.payments.views import (
    FullPaymentViewSet,
    InstallmentPlanViewSet,
    InstallmentPaymentViewSet,
)

router = DefaultRouter()
router.register(r'full', FullPaymentViewSet, basename='full-payment')
router.register(r'installment-plans', InstallmentPlanViewSet, basename='installment-plan')
router.register(r'installment-payments', InstallmentPaymentViewSet, basename='installment-payment')

urlpatterns = [
    path('', include(router.urls)),
]
