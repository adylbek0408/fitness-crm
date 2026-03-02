from rest_framework.routers import DefaultRouter

from .views import TrainerViewSet

router = DefaultRouter()
router.register(r'trainers', TrainerViewSet, basename='trainer')
urlpatterns = router.urls
