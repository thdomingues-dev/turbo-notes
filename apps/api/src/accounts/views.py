from django.contrib.auth import login, logout
from django.core.exceptions import ValidationError as DjangoValidationError
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializers import (
    LoginSerializer,
    SessionSerializer,
    SignupSerializer,
    UserSerializer,
)
from accounts.services import (
    EmailAlreadyRegisteredError,
    InvalidCredentialsError,
    authenticate_account,
    create_account,
)
from config.openapi import (
    BAD_REQUEST_RESPONSE,
    CSRF_HEADER_PARAMETER,
    FORBIDDEN_RESPONSE,
    INTERNAL_ERROR_RESPONSE,
    PAYLOAD_TOO_LARGE_RESPONSE,
    UNSUPPORTED_MEDIA_TYPE_RESPONSE,
)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class SessionView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: SessionSerializer, 500: INTERNAL_ERROR_RESPONSE})
    def get(self, request: Request) -> Response:
        user = UserSerializer(request.user).data if request.user.is_authenticated else None
        payload = {
            "authenticated": request.user.is_authenticated,
            "user": user,
            "csrf_token": get_token(request),
        }
        return Response(payload)


@method_decorator(csrf_protect, name="dispatch")
class SignupView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=SignupSerializer,
        parameters=[CSRF_HEADER_PARAMETER],
        responses={
            201: UserSerializer,
            400: BAD_REQUEST_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            413: PAYLOAD_TOO_LARGE_RESPONSE,
            415: UNSUPPORTED_MEDIA_TYPE_RESPONSE,
            500: INTERNAL_ERROR_RESPONSE,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = create_account(**serializer.validated_data)
        except EmailAlreadyRegisteredError as exc:
            raise drf_serializers.ValidationError(
                {"email": "An account with this email already exists."}
            ) from exc
        except DjangoValidationError as exc:
            raise drf_serializers.ValidationError({"password": exc.messages}) from exc
        login(request, user)
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=LoginSerializer,
        parameters=[CSRF_HEADER_PARAMETER],
        responses={
            200: UserSerializer,
            400: BAD_REQUEST_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            413: PAYLOAD_TOO_LARGE_RESPONSE,
            415: UNSUPPORTED_MEDIA_TYPE_RESPONSE,
            500: INTERNAL_ERROR_RESPONSE,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        try:
            user = authenticate_account(request=request, **serializer.validated_data)
        except InvalidCredentialsError as exc:
            raise drf_serializers.ValidationError(
                {"non_field_errors": ["Invalid email or password."]}
            ) from exc
        login(request, user)
        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=None,
        parameters=[CSRF_HEADER_PARAMETER],
        responses={
            204: None,
            403: FORBIDDEN_RESPONSE,
            500: INTERNAL_ERROR_RESPONSE,
        },
    )
    def post(self, request: Request) -> Response:
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)
