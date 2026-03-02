from django.views.generic import TemplateView


class LoginView(TemplateView):
    template_name = 'frontend/login.html'


class DashboardView(TemplateView):
    template_name = 'frontend/dashboard.html'


class ClientRegisterView(TemplateView):
    template_name = 'frontend/client_register.html'


class ClientListView(TemplateView):
    template_name = 'frontend/client_list.html'


class ClientDetailView(TemplateView):
    template_name = 'frontend/client_detail.html'
