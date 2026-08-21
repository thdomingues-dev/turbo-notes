from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import PermissionDenied


class CSRFFailed(PermissionDenied):
    default_code = "csrf_failed"
    default_detail = "CSRF verification failed."


class ContractSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        try:
            super().enforce_csrf(request)
        except PermissionDenied as exc:
            raise CSRFFailed from exc
