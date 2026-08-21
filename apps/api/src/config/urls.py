from django.conf import settings
from django.urls import include, path, re_path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.permissions import AllowAny

from config.api import not_found
from config.health import liveness, readiness

urlpatterns = [
    path("health/live/", liveness, name="health-live"),
    path("health/ready/", readiness, name="health-ready"),
    path("api/v1/auth/", include("accounts.urls")),
    path("api/v1/", include("notes.urls")),
]

if settings.API_DOCS_ENABLED:
    urlpatterns += [
        path(
            "api/schema/",
            SpectacularAPIView.as_view(permission_classes=[AllowAny]),
            name="api-schema",
        ),
        path(
            "api/docs/",
            SpectacularSwaggerView.as_view(
                url_name="api-schema",
                permission_classes=[AllowAny],
            ),
            name="api-docs",
        ),
    ]

# Keep routing failures inside the JSON contract, including with DEBUG enabled.
urlpatterns.append(re_path(r"^api/v1(?:/.*)?$", not_found, name="api-not-found"))

handler404 = "config.api.not_found"
