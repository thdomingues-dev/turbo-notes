from django.contrib.auth import authenticate, password_validation
from django.db import IntegrityError, transaction
from django.http import HttpRequest

from accounts.models import User


class EmailAlreadyRegisteredError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


def create_account(*, email: str, password: str) -> User:
    normalized_email = User.objects.normalize_email(email).strip().lower()
    password_validation.validate_password(password, user=User(email=normalized_email))

    try:
        with transaction.atomic():
            return User.objects.create_user(email=normalized_email, password=password)
    except IntegrityError as exc:
        if User.objects.filter(email__iexact=normalized_email).exists():
            raise EmailAlreadyRegisteredError from exc
        raise


def authenticate_account(
    *,
    email: str,
    password: str,
    request: HttpRequest | None = None,
) -> User:
    user = authenticate(request=request, email=email.strip().lower(), password=password)
    if not isinstance(user, User) or not user.is_active:
        raise InvalidCredentialsError
    return user
