import pytest
from django.db import IntegrityError, transaction
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User
from accounts.services import EmailAlreadyRegisteredError, create_account

pytestmark = pytest.mark.django_db

PASSWORD = "Correct-Horse-Battery-Fixture!"


def current_csrf_token(client: APIClient) -> str:
    return client.cookies["csrftoken"].value


def test_session_bootstraps_csrf_cookie_and_reports_anonymous_user():
    client = APIClient(enforce_csrf_checks=True)

    response = client.get(reverse("accounts:session"))

    assert response.status_code == 200
    assert response.data["authenticated"] is False
    assert response.data["user"] is None
    assert response.data["csrf_token"]
    assert client.cookies["csrftoken"]


def test_signup_requires_csrf_and_authenticates_session():
    client = APIClient(enforce_csrf_checks=True)
    payload = {"email": "new@example.com", "password": PASSWORD}

    rejected = client.post(reverse("accounts:signup"), payload, format="json")
    assert rejected.status_code == 403
    assert rejected.json()["code"] == "csrf_failed"

    client.get(reverse("accounts:session"))
    response = client.post(
        reverse("accounts:signup"),
        payload,
        format="json",
        HTTP_X_CSRFTOKEN=current_csrf_token(client),
    )

    assert response.status_code == 201
    assert response.data["email"] == "new@example.com"
    user = User.objects.get(email="new@example.com")
    assert client.cookies["sessionid"]["httponly"] is True

    session_response = client.get(reverse("accounts:session"))
    assert session_response.data["authenticated"] is True
    assert session_response.data["user"]["id"] == str(user.id)


def test_login_uses_generic_failure_and_logout_requires_csrf(user):
    client = APIClient(enforce_csrf_checks=True)
    client.get(reverse("accounts:session"))

    invalid = client.post(
        reverse("accounts:login"),
        {"email": user.email, "password": "Wrong-Password-Fixture!"},
        format="json",
        HTTP_X_CSRFTOKEN=current_csrf_token(client),
    )
    assert invalid.status_code == 400
    assert "Invalid email or password" in str(invalid.data)

    logged_in = client.post(
        reverse("accounts:login"),
        {"email": user.email.upper(), "password": PASSWORD},
        format="json",
        HTTP_X_CSRFTOKEN=current_csrf_token(client),
    )
    assert logged_in.status_code == 200

    rejected_logout = client.post(reverse("accounts:logout"), format="json")
    assert rejected_logout.status_code == 403
    assert rejected_logout.data == {
        "code": "csrf_failed",
        "detail": "CSRF verification failed.",
    }

    logged_out = client.post(
        reverse("accounts:logout"),
        format="json",
        HTTP_X_CSRFTOKEN=current_csrf_token(client),
    )
    assert logged_out.status_code == 204
    assert client.get(reverse("accounts:session")).data["authenticated"] is False


@pytest.mark.parametrize(
    "request_headers",
    [
        {"HTTP_ORIGIN": "https://attacker.example"},
        {"HTTP_REFERER": "https://attacker.example/login"},
    ],
)
def test_auth_writes_reject_hostile_origin_and_referer(request_headers):
    client = APIClient(enforce_csrf_checks=True)
    client.get(reverse("accounts:session"), secure=True)

    response = client.post(
        reverse("accounts:signup"),
        {"email": "origin-check@example.com", "password": PASSWORD},
        format="json",
        secure=True,
        HTTP_X_CSRFTOKEN=current_csrf_token(client),
        **request_headers,
    )

    assert response.status_code == 403
    assert response.json() == {
        "code": "csrf_failed",
        "detail": "CSRF verification failed.",
    }
    assert not User.objects.filter(email="origin-check@example.com").exists()


def test_signup_rejects_case_insensitive_duplicate_email(user):
    csrf_client = APIClient(enforce_csrf_checks=True)
    csrf_client.get(reverse("accounts:session"))
    response = csrf_client.post(
        reverse("accounts:signup"),
        {"email": user.email.upper(), "password": PASSWORD},
        format="json",
        HTTP_X_CSRFTOKEN=current_csrf_token(csrf_client),
    )
    assert response.status_code == 400
    assert User.objects.filter(email__iexact=user.email).count() == 1


def test_user_manager_normalizes_email_and_database_guards_case_insensitive_uniqueness(db):
    user = User.objects.create_user(email="MixedCase@Example.COM", password=PASSWORD)
    assert user.email == "mixedcase@example.com"

    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.create(email="MIXEDCASE@example.com", password="not-a-real-hash")


def test_registration_service_handles_duplicate_email_race(user):
    with pytest.raises(EmailAlreadyRegisteredError):
        create_account(email=user.email.upper(), password=PASSWORD)


@pytest.mark.parametrize("endpoint", ["signup", "login"])
def test_auth_write_serializers_reject_unknown_fields(endpoint, user):
    client = APIClient(enforce_csrf_checks=True)
    client.get(reverse("accounts:session"))

    response = client.post(
        reverse(f"accounts:{endpoint}"),
        {"email": user.email, "password": PASSWORD, "unexpected": "value"},
        format="json",
        HTTP_X_CSRFTOKEN=current_csrf_token(client),
    )

    assert response.status_code == 400
    assert response.data["errors"] == {"unexpected": ["Unknown field."]}


def test_validation_error_uses_stable_typed_envelope():
    client = APIClient(enforce_csrf_checks=True)
    client.get(reverse("accounts:session"))

    response = client.post(
        reverse("accounts:signup"),
        {"email": "new@example.com"},
        format="json",
        HTTP_X_CSRFTOKEN=current_csrf_token(client),
    )

    assert response.status_code == 400
    assert response.data["code"] == "validation_error"
    assert response.data["detail"] == "Request validation failed."
    assert isinstance(response.data["errors"]["password"], list)
