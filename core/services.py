import logging

from core.exceptions import DomainException


class BaseService:
    """
    All services inherit from this.
    Provides logging, exception wrapping.
    """
    logger = logging.getLogger(__name__)

    def _handle_domain_error(self, exc: DomainException):
        self.logger.warning(f"Domain error: {exc}")
        raise exc
