import pytest
from rest_framework.test import APIClient

from accounts.services import create_account


@pytest.fixture
def user(db):
    return create_account(email="alice@example.com", password="Correct-Horse-Battery-Fixture!")


@pytest.fixture
def other_user(db):
    return create_account(email="bob@example.com", password="Another-Correct-Password-Fixture!")


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def authenticated_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client
