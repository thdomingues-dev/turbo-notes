from collections.abc import Callable

from django.http import HttpRequest, HttpResponse


class PrivateApiCacheControlMiddleware:
    """Keep account and note API responses out of shared and browser caches."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        if request.path == "/api/v1" or request.path.startswith("/api/v1/"):
            response["Cache-Control"] = "private, no-store"
        return response
