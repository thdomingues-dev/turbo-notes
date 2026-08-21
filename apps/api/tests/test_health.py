from unittest.mock import patch

import pytest
from django.db import connection
from django.db.utils import OperationalError
from django.test.utils import CaptureQueriesContext
from django.urls import reverse


def test_postgresql_connections_have_a_bounded_connect_timeout(settings):
    assert settings.DATABASES["default"]["OPTIONS"]["connect_timeout"] == 5


@pytest.mark.django_db
def test_liveness_reports_ok(client):
    response = client.get(reverse("health-live"))

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert "no-store" in response["Cache-Control"]


@pytest.mark.parametrize("endpoint", ["health-live", "health-ready"])
@pytest.mark.django_db
def test_health_endpoints_allow_safe_methods_only_and_are_never_cached(client, endpoint):
    url = reverse(endpoint)

    head = client.head(url)
    post = client.post(url)

    assert head.status_code == 200
    assert head.content == b""
    assert "no-store" in head["Cache-Control"]
    assert post.status_code == 405


@pytest.mark.django_db
def test_readiness_uses_one_lightweight_database_probe(client):
    with CaptureQueriesContext(connection) as queries:
        response = client.get(reverse("health-ready"))

    assert response.status_code == 200
    assert [query["sql"] for query in queries.captured_queries] == ["SELECT 1"]
    assert "no-store" in response["Cache-Control"]


@pytest.mark.django_db
def test_readiness_rejects_database_errors_without_affecting_liveness(client):
    with patch("config.health.connection.cursor", side_effect=OperationalError):
        response = client.get(reverse("health-ready"))

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}
    assert client.get(reverse("health-live")).json() == {"status": "ok"}
