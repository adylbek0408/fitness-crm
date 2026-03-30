from decimal import Decimal, InvalidOperation

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.permissions import IsAdminOrRegistrar
from apps.clients.bonus_service import BonusService
from apps.clients.models import BonusTransaction


class BonusViewSet(viewsets.GenericViewSet):
    """
    Endpoints бонусной системы.

    POST /api/bonuses/preview/   — посмотреть сколько спишется (без изменений)
    POST /api/bonuses/apply/     — реально списать бонус
    GET  /api/bonuses/history/   — история операций клиента
                                   ?client_id=<uuid>
    """
    service = BonusService()
    permission_classes = [IsAdminOrRegistrar]

    def _parse_price(self, raw) -> Decimal | None:
        try:
            v = Decimal(str(raw))
            if v <= 0:
                return None
            return v
        except (InvalidOperation, TypeError):
            return None

    @action(detail=False, methods=['post'], url_path='preview')
    def preview(self, request):
        """
        Body: { "client_id": "...", "full_price": 15000 }
        Возвращает расчёт без изменения данных.
        """
        client_id = request.data.get('client_id')
        full_price = self._parse_price(request.data.get('full_price'))

        if not client_id:
            return Response({'detail': 'client_id обязателен'},
                            status=status.HTTP_400_BAD_REQUEST)
        if full_price is None:
            return Response({'detail': 'full_price должен быть > 0'},
                            status=status.HTTP_400_BAD_REQUEST)

        result = self.service.preview(client_id, full_price)
        return Response({k: str(v) for k, v in result.items()})

    @action(detail=False, methods=['post'], url_path='apply')
    def apply(self, request):
        """
        Body: { "client_id": "...", "full_price": 15000 }
        Списывает бонусы, возвращает итоговую сумму к оплате.
        """
        client_id = request.data.get('client_id')
        full_price = self._parse_price(request.data.get('full_price'))

        if not client_id:
            return Response({'detail': 'client_id обязателен'},
                            status=status.HTTP_400_BAD_REQUEST)
        if full_price is None:
            return Response({'detail': 'full_price должен быть > 0'},
                            status=status.HTTP_400_BAD_REQUEST)

        result = self.service.apply(client_id, full_price, created_by=request.user)
        return Response({k: str(v) for k, v in result.items()})

    @action(detail=False, methods=['get'], url_path='history')
    def history(self, request):
        """
        GET /api/bonuses/history/?client_id=<uuid>
        Возвращает список бонусных операций клиента.
        """
        client_id = request.query_params.get('client_id')
        if not client_id:
            return Response({'detail': 'client_id обязателен'},
                            status=status.HTTP_400_BAD_REQUEST)

        records = self.service.get_history(client_id)
        data = [
            {
                'id':               str(r.id),
                'type':             r.transaction_type,
                'amount':           str(r.amount),
                'payment_amount':   str(r.payment_amount) if r.payment_amount else None,
                'description':      r.description,
                'created_at':       r.created_at.strftime('%Y-%m-%d %H:%M'),
                'created_by':       r.created_by.username if r.created_by else None,
            }
            for r in records
        ]
        return Response(data)
