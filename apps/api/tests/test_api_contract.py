from unittest.mock import patch

import pytest
from django.test import override_settings
from django.urls import reverse
from drf_spectacular.generators import SchemaGenerator
from rest_framework.exceptions import PermissionDenied
from rest_framework.test import APIClient

from config.api import exception_handler

pytestmark = pytest.mark.django_db


def csrf_token(client: APIClient) -> str:
    client.get(reverse("accounts:session"))
    return client.cookies["csrftoken"].value


def test_non_json_product_request_returns_precise_415_envelope():
    client = APIClient(enforce_csrf_checks=True)
    token = csrf_token(client)

    response = client.generic(
        "POST",
        reverse("accounts:login"),
        data="email=user%40example.com&password=secret",
        content_type="application/x-www-form-urlencoded",
        HTTP_X_CSRFTOKEN=token,
    )

    assert response.status_code == 415
    assert response.data["code"] == "unsupported_media_type"
    assert isinstance(response.data["detail"], str)
    assert set(response.data) == {"code", "detail"}


def test_oversized_json_returns_a_quiet_typed_413(authenticated_client, caplog):
    with override_settings(DATA_UPLOAD_MAX_MEMORY_SIZE=64):
        response = authenticated_client.post(
            reverse("notes:note-list"),
            {"unexpected": "x" * 100},
            format="json",
        )

    assert response.status_code == 413
    assert response.data == {
        "code": "payload_too_large",
        "detail": "The request body is too large.",
    }
    assert "Traceback" not in caplog.text


def test_product_api_negotiates_json_responses_only():
    response = APIClient().get(
        reverse("accounts:session"),
        HTTP_ACCEPT="text/html",
    )

    assert response.status_code == 406
    assert response["Content-Type"].startswith("application/json")
    assert response.data["code"] == "not_acceptable"


def test_authentication_and_not_found_failures_use_the_same_envelope(authenticated_client):
    forbidden = APIClient().get(reverse("notes:category-list"))
    missing = authenticated_client.get(
        reverse("notes:note-detail", args=["00000000-0000-0000-0000-000000000000"])
    )

    assert forbidden.status_code == 403
    assert forbidden.data["code"] == "not_authenticated"
    assert isinstance(forbidden.data["detail"], str)
    assert missing.status_code == 404
    assert missing.data["code"] == "not_found"
    assert isinstance(missing.data["detail"], str)


def test_malformed_ids_and_unknown_api_paths_return_json_not_found_envelopes():
    client = APIClient()

    for path in ("/api/v1", "/api/v1/notes/not-a-uuid/", "/api/v1/not-a-real-route/"):
        response = client.get(path)
        assert response.status_code == 404
        assert response["Content-Type"].startswith("application/json")
        assert response["Cache-Control"] == "private, no-store"
        assert response.json() == {"code": "not_found", "detail": "Not found."}


@override_settings(DEBUG=True)
def test_api_routing_failures_remain_json_while_debugging_locally():
    response = APIClient().get("/api/v1/notes/not-a-uuid/")

    assert response.status_code == 404
    assert response["Content-Type"].startswith("application/json")
    assert response.json()["code"] == "not_found"


def test_unexpected_api_exception_is_redacted_in_response_and_logs(authenticated_client, caplog):
    with patch("notes.views.Note.objects.create", side_effect=RuntimeError("sensitive detail")):
        response = authenticated_client.post(
            reverse("notes:note-list"),
            {},
            format="json",
        )

    assert response.status_code == 500
    assert response.data["code"] == "internal_error"
    assert response.data["detail"] == "An unexpected error occurred."
    assert set(response.data) == {"code", "detail"}
    assert "RuntimeError" in caplog.text


def test_ordinary_permission_denial_keeps_its_distinct_error_code():
    response = exception_handler(PermissionDenied(), {})

    assert response.status_code == 403
    assert response.data["code"] == "permission_denied"


def test_product_api_responses_are_private_and_not_cacheable(authenticated_client):
    session_response = APIClient().get(reverse("accounts:session"))
    private_response = authenticated_client.get(reverse("notes:category-list"))
    error_response = APIClient().get(reverse("notes:category-list"))

    for response in (session_response, private_response, error_response):
        assert response["Cache-Control"] == "private, no-store"


def test_openapi_models_json_only_requests_and_typed_errors():
    schema = SchemaGenerator().get_schema(request=None, public=True)
    paths = schema["paths"]

    for path, method in (
        ("/api/v1/auth/login/", "post"),
        ("/api/v1/auth/signup/", "post"),
        ("/api/v1/notes/", "post"),
        ("/api/v1/notes/{id}/", "patch"),
    ):
        assert set(paths[path][method]["requestBody"]["content"]) == {"application/json"}

    expected_statuses = {
        ("/api/v1/auth/login/", "post"): {"200", "400", "403", "406", "413", "415", "500"},
        ("/api/v1/auth/logout/", "post"): {"204", "403", "406", "500"},
        ("/api/v1/auth/session/", "get"): {"200", "406", "500"},
        ("/api/v1/auth/signup/", "post"): {
            "201",
            "400",
            "403",
            "406",
            "413",
            "415",
            "500",
        },
        ("/api/v1/categories/", "get"): {"200", "403", "406", "500"},
        ("/api/v1/notes/", "get"): {"200", "400", "403", "406", "500"},
        ("/api/v1/notes/", "post"): {
            "201",
            "400",
            "403",
            "406",
            "409",
            "413",
            "415",
            "500",
        },
        ("/api/v1/notes/{id}/", "get"): {"200", "403", "404", "406", "500"},
        ("/api/v1/notes/{id}/", "patch"): {
            "200",
            "400",
            "403",
            "404",
            "406",
            "409",
            "413",
            "415",
            "500",
        },
        ("/api/v1/notes/{id}/", "delete"): {"204", "403", "404", "406", "500"},
    }
    for operation, statuses in expected_statuses.items():
        path, method = operation
        assert set(paths[path][method]["responses"]) == statuses

    error_schema = schema["components"]["schemas"]["Error"]
    assert set(error_schema["properties"]) == {"code", "detail", "errors"}
    assert error_schema["properties"]["detail"]["type"] == "string"
    assert (
        paths["/api/v1/categories/"]["get"]["responses"]["403"]["content"]["application/json"][
            "schema"
        ]["$ref"]
        == "#/components/schemas/Error"
    )
    assert (
        paths["/api/v1/notes/{id}/"]["patch"]["responses"]["409"]["content"]["application/json"][
            "schema"
        ]["$ref"]
        == "#/components/schemas/RevisionConflictError"
    )
    assert (
        paths["/api/v1/auth/logout/"]["post"]["responses"]["403"]["content"]["application/json"][
            "schema"
        ]["$ref"]
        == "#/components/schemas/Error"
    )
    patch_schema = paths["/api/v1/notes/{id}/"]["patch"]["requestBody"]["content"][
        "application/json"
    ]["schema"]
    if "$ref" in patch_schema:
        component_name = patch_schema["$ref"].rsplit("/", 1)[-1]
        patch_schema = schema["components"]["schemas"][component_name]
    assert patch_schema["type"] == "object"
    assert set(patch_schema["properties"]) == {"revision", "category_key", "title", "content"}
    assert patch_schema["required"] == ["revision"]
    assert patch_schema["additionalProperties"] is False
    assert patch_schema["minProperties"] == 2
    assert paths["/api/v1/notes/{id}/"]["patch"]["requestBody"]["required"] is True

    note_create_schema = schema["components"]["schemas"]["NoteCreateRequest"]
    assert "category_key" not in note_create_schema.get("required", [])
    assert note_create_schema["additionalProperties"] is False

    create_operation = paths["/api/v1/notes/"]["post"]
    create_parameters = {
        parameter["name"]: parameter for parameter in create_operation["parameters"]
    }
    assert create_parameters["Idempotency-Key"]["schema"]["format"] == "uuid"
    assert create_parameters["Idempotency-Key"].get("required", False) is False
    assert "Location" in create_operation["responses"]["201"]["headers"]

    list_parameters = {
        parameter["name"]: parameter for parameter in paths["/api/v1/notes/"]["get"]["parameters"]
    }
    assert set(list_parameters["category"]["schema"]["enum"]) == {
        "random-thoughts",
        "school",
        "personal",
        "drama",
    }
    assert set(list_parameters) == {"category", "cursor"}
    assert list_parameters["cursor"]["schema"] == {
        "type": "string",
        "minLength": 1,
        "maxLength": 1024,
    }

    list_response_schema = paths["/api/v1/notes/"]["get"]["responses"]["200"]["content"][
        "application/json"
    ]["schema"]
    list_component_name = list_response_schema["$ref"].rsplit("/", 1)[-1]
    list_page_schema = schema["components"]["schemas"][list_component_name]
    assert set(list_page_schema["properties"]) == {"next", "previous", "results"}
