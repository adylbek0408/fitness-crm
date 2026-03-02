import pytest
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.mark.django_db
class TestUserModel:
    def test_user_creation_with_role(self):
        user = User.objects.create_user(
            username='testuser',
            password='testpass123',
            role='admin'
        )
        assert user.role == 'admin'
        assert user.username == 'testuser'

    def test_default_role_is_registrar(self):
        user = User.objects.create_user(
            username='registrar_user',
            password='testpass123'
        )
        assert user.role == 'registrar'

    def test_str_format_is_correct(self):
        user = User.objects.create_user(
            username='admin_user',
            password='testpass123',
            role='admin'
        )
        assert str(user) == 'admin_user (admin)'
