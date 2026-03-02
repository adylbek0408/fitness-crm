

class DomainException(Exception):
    """Base domain exception"""
    pass


class ValidationError(DomainException):
    pass


class NotFoundError(DomainException):
    pass


class PermissionDeniedError(DomainException):
    pass
