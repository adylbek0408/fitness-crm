import pytest
from decimal import Decimal
from apps.statistics.models import Statistic


@pytest.mark.django_db
class TestStatisticModel:
    def test_statistic_creation(self):
        stat = Statistic.objects.create(metric_name='total_revenue', value=Decimal('1000.00'))
        assert stat.metric_name == 'total_revenue'
        assert stat.value == Decimal('1000.00')
