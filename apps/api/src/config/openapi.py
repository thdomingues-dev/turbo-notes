from django.conf import settings
from drf_spectacular.extensions import OpenApiAuthenticationExtension
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse
from rest_framework import serializers


class ContractSessionAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "config.authentication.ContractSessionAuthentication"
    name = "cookieAuth"

    def get_security_definition(self, auto_schema):
        del auto_schema
        return {
            "type": "apiKey",
            "in": "cookie",
            "name": settings.SESSION_COOKIE_NAME,
        }


class ErrorSerializer(serializers.Serializer):
    code = serializers.CharField(read_only=True)
    detail = serializers.CharField(read_only=True)
    errors = serializers.DictField(
        child=serializers.ListField(child=serializers.CharField()),
        required=False,
    )


BAD_REQUEST_RESPONSE = OpenApiResponse(ErrorSerializer, description="Invalid request")
CONFLICT_RESPONSE = OpenApiResponse(ErrorSerializer, description="Request conflict")
FORBIDDEN_RESPONSE = OpenApiResponse(ErrorSerializer, description="Forbidden")
NOT_FOUND_RESPONSE = OpenApiResponse(ErrorSerializer, description="Not found")
PAYLOAD_TOO_LARGE_RESPONSE = OpenApiResponse(
    ErrorSerializer,
    description="Request body exceeds the configured limit",
)
UNSUPPORTED_MEDIA_TYPE_RESPONSE = OpenApiResponse(
    ErrorSerializer,
    description="Only application/json is accepted",
)
INTERNAL_ERROR_RESPONSE = OpenApiResponse(
    ErrorSerializer,
    description="Unexpected server error",
)

CSRF_HEADER_PARAMETER = OpenApiParameter(
    name="X-CSRFToken",
    type=str,
    location=OpenApiParameter.HEADER,
    required=True,
    description="Token bootstrapped by GET /api/v1/auth/session/.",
)


def postprocess_contract_schema(result, generator, request, public):
    """Express runtime-only strictness that PATCH inference cannot preserve."""
    del generator, request, public
    schemas = result["components"]["schemas"]
    strict_requests = (
        "LoginRequest",
        "SignupRequest",
        "NoteCreateRequest",
        "PatchedNotePatchRequest",
    )
    for component_name in strict_requests:
        schemas[component_name]["additionalProperties"] = False

    patch_schema = schemas["PatchedNotePatchRequest"]
    patch_schema["required"] = ["revision"]
    # Revision plus at least one editable property must be present.
    patch_schema["minProperties"] = 2
    result["paths"]["/api/v1/notes/{id}/"]["patch"]["requestBody"]["required"] = True

    for path_item in result["paths"].values():
        for operation in path_item.values():
            if not isinstance(operation, dict) or "responses" not in operation:
                continue
            operation["responses"].setdefault(
                "406",
                {
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/Error"},
                        }
                    },
                    "description": "The requested response representation is not available",
                },
            )
    return result
