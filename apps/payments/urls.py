from django.urls import re_path
from .views import FullPaymentViewSet, InstallmentPlanViewSet

UUID = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

urlpatterns = [
    re_path(r'^full/(?P<pk>' + UUID + r')/pay/$',
            FullPaymentViewSet.as_view({'post': 'mark_paid'}),
            name='full-payment-pay'),
    re_path(r'^full/(?P<pk>' + UUID + r')/receipt/$',
            FullPaymentViewSet.as_view({'post': 'upload_receipt'}),
            name='full-payment-receipt'),
    re_path(r'^installment/(?P<pk>' + UUID + r')/payments/$',
            InstallmentPlanViewSet.as_view({'post': 'add_payment'}),
            name='installment-add-payment'),
    re_path(r'^installment/(?P<pk>' + UUID + r')/summary/$',
            InstallmentPlanViewSet.as_view({'get': 'summary'}),
            name='installment-summary'),
]

