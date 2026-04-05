"""
Тесты для GroupService.
Покрывают:
  - update_group: обычные изменения (без смены статуса)
  - update_group: автозакрытие потока при status→completed
      • активные клиенты → completed
      • замороженные/отчисленные клиенты НЕ меняют статус
      • история ClientGroupHistory сохраняется
      • клиенты открепляются от потока (group=None)
  - close_group: прямой вызов
  - activate_group: из recruitment → active
"""

import pytest
from datetime import date
from decimal import Decimal

from core.exceptions import ValidationError

from apps.groups.models import Group
from apps.groups.services import GroupService
from apps.clients.models import Client, ClientGroupHistory
from apps.trainers.models import Trainer
from apps.payments.models import FullPayment


# ─────────────────────────────────────────────
# Фабрики (хелперы)
# ─────────────────────────────────────────────

def make_trainer(**kwargs):
    defaults = dict(first_name='Иван', last_name='Тренеров')
    defaults.update(kwargs)
    return Trainer.objects.create(**defaults)


def make_group(trainer, status='active', number=1, **kwargs):
    defaults = dict(
        number=number,
        group_type='1.5h',
        start_date=date(2025, 1, 1),
        trainer=trainer,
        status=status,
    )
    defaults.update(kwargs)
    return Group.objects.create(**defaults)


def make_client(group=None, status='active', phone_suffix='001', **kwargs):
    defaults = dict(
        first_name='Клиент',
        last_name='Тестов',
        phone=f'+7999{phone_suffix}',
        training_format='offline',
        group_type='1.5h',
        payment_type='full',
        status=status,
        group=group,
    )
    defaults.update(kwargs)
    c = Client.objects.create(**defaults)
    FullPayment.objects.create(client=c, amount=Decimal('15000.00'), is_paid=True)
    return c


# ─────────────────────────────────────────────
# Тесты GroupService
# ─────────────────────────────────────────────

@pytest.mark.django_db
class TestGroupServiceUpdateGroup:
    """update_group — обычные изменения (статус НЕ меняется на completed)."""

    def test_update_number_ok(self):
        trainer = make_trainer()
        group = make_group(trainer, number=10)
        svc = GroupService()
        updated = svc.update_group(str(group.id), {'number': 11})
        assert updated.number == 11

    def test_update_number_duplicate_raises(self):
        trainer = make_trainer()
        make_group(trainer, number=20)
        group2 = make_group(trainer, number=21)
        svc = GroupService()
        with pytest.raises(ValidationError, match='already taken'):
            svc.update_group(str(group2.id), {'number': 20})

    def test_update_status_to_active_does_not_close(self):
        """Смена статуса на active не должна трогать клиентов."""
        trainer = make_trainer()
        group = make_group(trainer, status='recruitment')
        client = make_client(group=group, phone_suffix='100')
        svc = GroupService()
        svc.update_group(str(group.id), {'status': 'active'})
        client.refresh_from_db()
        assert client.status == 'active'          # статус клиента не изменился
        assert client.group_id == group.id         # привязка к потоку сохранена

    def test_update_nonexistent_group_raises(self):
        svc = GroupService()
        with pytest.raises(Exception):  # NotFoundError
            svc.update_group('00000000-0000-0000-0000-000000000000', {'number': 99})


@pytest.mark.django_db
class TestGroupServiceUpdateGroupAutoClose:
    """update_group со status=completed → должно автоматически закрыть поток."""

    def _setup(self, statuses=('active',), count=1):
        trainer = make_trainer()
        group = make_group(trainer, status='active', number=50)
        clients = []
        for i, st in enumerate(statuses):
            c = make_client(group=group, status=st, phone_suffix=f'2{i:02d}')
            clients.append(c)
        return group, clients

    # ── 1. Активные клиенты → completed ──────────────────────────
    def test_active_clients_become_completed(self):
        group, (client,) = self._setup(statuses=('active',))
        svc = GroupService()
        svc.update_group(str(group.id), {'status': 'completed'})
        client.refresh_from_db()
        assert client.status == 'completed'

    # ── 2. Статус потока становится completed ────────────────────
    def test_group_status_becomes_completed(self):
        group, _ = self._setup(statuses=('active',))
        svc = GroupService()
        result = svc.update_group(str(group.id), {'status': 'completed'})
        assert result.status == 'completed'

    # ── 3. Клиенты открепляются от потока ───────────────────────
    def test_clients_detached_from_group(self):
        group, (client,) = self._setup(statuses=('active',))
        svc = GroupService()
        svc.update_group(str(group.id), {'status': 'completed'})
        client.refresh_from_db()
        assert client.group is None

    # ── 4. История сохраняется ───────────────────────────────────
    def test_history_created_for_each_client(self):
        trainer = make_trainer()
        group = make_group(trainer, status='active', number=51)
        c1 = make_client(group=group, phone_suffix='301')
        c2 = make_client(group=group, phone_suffix='302')
        svc = GroupService()
        svc.update_group(str(group.id), {'status': 'completed'})
        assert ClientGroupHistory.objects.filter(group_number=51).count() == 2

    # ── 5. Замороженный клиент НЕ меняет статус ──────────────────
    def test_frozen_client_status_unchanged(self):
        trainer = make_trainer()
        group = make_group(trainer, status='active', number=52)
        frozen = make_client(group=group, status='frozen', phone_suffix='401')
        svc = GroupService()
        svc.update_group(str(group.id), {'status': 'completed'})
        frozen.refresh_from_db()
        assert frozen.status == 'frozen'    # остался frozen, НЕ completed

    # ── 6. Отчисленный клиент НЕ меняет статус ───────────────────
    def test_expelled_client_status_unchanged(self):
        trainer = make_trainer()
        group = make_group(trainer, status='active', number=53)
        expelled = make_client(group=group, status='expelled', phone_suffix='501')
        svc = GroupService()
        svc.update_group(str(group.id), {'status': 'completed'})
        expelled.refresh_from_db()
        assert expelled.status == 'expelled'

    # ── 7. Смешанный поток: активный + замороженный ──────────────
    def test_mixed_statuses_only_active_completes(self):
        trainer = make_trainer()
        group = make_group(trainer, status='active', number=54)
        active  = make_client(group=group, status='active',  phone_suffix='601')
        frozen  = make_client(group=group, status='frozen',  phone_suffix='602')
        expelled = make_client(group=group, status='expelled', phone_suffix='603')
        svc = GroupService()
        svc.update_group(str(group.id), {'status': 'completed'})
        active.refresh_from_db()
        frozen.refresh_from_db()
        expelled.refresh_from_db()
        assert active.status   == 'completed'
        assert frozen.status   == 'frozen'
        assert expelled.status == 'expelled'
        # Все открепились от потока
        assert active.group   is None
        assert frozen.group   is None
        assert expelled.group is None

    # ── 8. Уже завершённый поток — ошибка ────────────────────────
    def test_already_completed_group_raises(self):
        trainer = make_trainer()
        group = make_group(trainer, status='completed', number=55)
        svc = GroupService()
        with pytest.raises(ValidationError, match='already completed'):
            svc.update_group(str(group.id), {'status': 'completed'})

    # ── 9. Поток без клиентов — закрывается без ошибок ───────────
    def test_empty_group_closes_ok(self):
        trainer = make_trainer()
        group = make_group(trainer, status='active', number=56)
        svc = GroupService()
        result = svc.update_group(str(group.id), {'status': 'completed'})
        assert result.status == 'completed'
        assert ClientGroupHistory.objects.filter(group_number=56).count() == 0

    # ── 10. Другие поля тоже сохраняются при закрытии ────────────
    def test_other_fields_saved_before_close(self):
        trainer = make_trainer()
        group = make_group(trainer, status='active', number=57)
        make_client(group=group, phone_suffix='701')
        svc = GroupService()
        end_date = date(2025, 12, 31)
        result = svc.update_group(str(group.id), {'status': 'completed', 'end_date': end_date})
        result.refresh_from_db()
        assert result.end_date == end_date
        assert result.status == 'completed'


@pytest.mark.django_db
class TestGroupServiceCloseGroup:
    """Прямой вызов close_group."""

    def test_close_group_directly(self):
        trainer = make_trainer()
        group = make_group(trainer, status='active', number=60)
        client = make_client(group=group, phone_suffix='800')
        svc = GroupService()
        result = svc.close_group(str(group.id))
        assert result.status == 'completed'
        client.refresh_from_db()
        assert client.status == 'completed'
        assert client.group is None

    def test_close_already_completed_raises(self):
        trainer = make_trainer()
        group = make_group(trainer, status='completed', number=61)
        svc = GroupService()
        with pytest.raises(ValidationError, match='already completed'):
            svc.close_group(str(group.id))


@pytest.mark.django_db
class TestGroupServiceActivate:
    """activate_group."""

    def test_activate_from_recruitment_ok(self):
        trainer = make_trainer()
        group = make_group(trainer, status='recruitment', number=70)
        svc = GroupService()
        result = svc.activate_group(str(group.id))
        assert result.status == 'active'

    def test_activate_active_group_raises(self):
        trainer = make_trainer()
        group = make_group(trainer, status='active', number=71)
        svc = GroupService()
        with pytest.raises(ValidationError, match='recruitment'):
            svc.activate_group(str(group.id))

    def test_activate_completed_group_raises(self):
        trainer = make_trainer()
        group = make_group(trainer, status='completed', number=72)
        svc = GroupService()
        with pytest.raises(ValidationError, match='recruitment'):
            svc.activate_group(str(group.id))
