import logging
from collections.abc import Mapping, Sequence
from typing import Any

from django.core.exceptions import RequestDataTooBig
from django.http import JsonResponse
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


def csrf_failure(request: Any, reason: str = "") -> JsonResponse:
    del request, reason
    return JsonResponse(
        {"code": "csrf_failed", "detail": "CSRF verification failed."},
        status=403,
    )


def not_found(request: Any, exception: Exception | None = None) -> JsonResponse:
    del request, exception
    return JsonResponse(
        {"code": "not_found", "detail": "Not found."},
        status=404,
    )


def exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    if isinstance(exc, RequestDataTooBig):
        return Response(
            {
                "code": "payload_too_large",
                "detail": "The request body is too large.",
            },
            status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )

    response = drf_exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled API exception", exc_info=exc)
        return Response(
            {
                "code": "internal_error",
                "detail": "An unexpected error occurred.",
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if isinstance(exc, ValidationError):
        response.data = {
            "code": "validation_error",
            "detail": "Request validation failed.",
            "errors": _validation_errors(response.data),
        }
        return response

    raw_detail = (
        response.data.get("detail") if isinstance(response.data, Mapping) else response.data
    )
    default_code = getattr(exc, "default_code", "request_error")
    response.data = {
        "code": str(getattr(raw_detail, "code", default_code)),
        "detail": _detail_text(raw_detail),
    }
    return response


def _detail_text(detail: Any) -> str:
    if isinstance(detail, Mapping):
        return "Request failed."
    if isinstance(detail, Sequence) and not isinstance(detail, (str, bytes, bytearray)):
        return " ".join(str(item) for item in detail)
    return str(detail)


def _validation_errors(detail: Any) -> dict[str, list[str]]:
    if not isinstance(detail, Mapping):
        return {"non_field_errors": _error_messages(detail)}
    return {str(field): _error_messages(errors) for field, errors in detail.items()}


def _error_messages(errors: Any) -> list[str]:
    if isinstance(errors, Mapping):
        return [
            f"{field}: {message}"
            for field, nested_errors in errors.items()
            for message in _error_messages(nested_errors)
        ]
    if isinstance(errors, Sequence) and not isinstance(errors, (str, bytes, bytearray)):
        return [message for error in errors for message in _error_messages(error)]
    return [str(errors)]
