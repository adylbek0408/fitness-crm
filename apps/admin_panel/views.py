from django.views.generic import TemplateView


class AdminLoginView(TemplateView):
    template_name = 'admin_panel/login.html'


class AdminDashboardView(TemplateView):
    template_name = 'admin_panel/dashboard.html'


class TrainerListView(TemplateView):
    template_name = 'admin_panel/trainers/list.html'


class TrainerFormView(TemplateView):
    template_name = 'admin_panel/trainers/form.html'


class GroupListView(TemplateView):
    template_name = 'admin_panel/groups/list.html'


class GroupFormView(TemplateView):
    template_name = 'admin_panel/groups/form.html'


class ClientListView(TemplateView):
    template_name = 'admin_panel/clients/list.html'


class ClientDetailView(TemplateView):
    template_name = 'admin_panel/clients/detail.html'


class StatisticsView(TemplateView):
    template_name = 'admin_panel/statistics/index.html'
