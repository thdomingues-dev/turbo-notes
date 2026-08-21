from django.db.models import Count
from django.db.models.functions import Substr
from django.http import Http404
from django.urls import reverse
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
    extend_schema_view,
)
from rest_framework import generics, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from config.openapi import (
    BAD_REQUEST_RESPONSE,
    CONFLICT_RESPONSE,
    CSRF_HEADER_PARAMETER,
    FORBIDDEN_RESPONSE,
    INTERNAL_ERROR_RESPONSE,
    NOT_FOUND_RESPONSE,
    PAYLOAD_TOO_LARGE_RESPONSE,
    UNSUPPORTED_MEDIA_TYPE_RESPONSE,
)
from notes.constants import NOTE_CONTENT_PREVIEW_LENGTH
from notes.models import CategoryKey, Note
from notes.pagination import NotePagination
from notes.serializers import (
    CategorySerializer,
    NoteCreateHeadersSerializer,
    NoteCreateSerializer,
    NoteCreationSnapshotSerializer,
    NoteDetailSerializer,
    NoteListQuerySerializer,
    NoteListSerializer,
    NotePatchSerializer,
    RevisionConflictCurrentSerializer,
    RevisionConflictErrorSerializer,
)
from notes.services import (
    IdempotencyConflictError,
    RevisionConflictError,
    create_note,
    update_note,
)

IDEMPOTENCY_KEY_PARAMETER = OpenApiParameter(
    name="Idempotency-Key",
    type=OpenApiTypes.UUID,
    location=OpenApiParameter.HEADER,
    required=False,
    description="Client-generated UUID. Reusing it safely replays the original creation.",
)
LOCATION_RESPONSE_HEADER = OpenApiParameter(
    name="Location",
    type=str,
    location=OpenApiParameter.HEADER,
    response=[201],
    description="Relative URL of the created note.",
)
IDEMPOTENCY_REPLAYED_RESPONSE_HEADER = OpenApiParameter(
    name="Idempotency-Replayed",
    type=bool,
    location=OpenApiParameter.HEADER,
    response=[201],
    description="Present and true when an earlier creation was replayed.",
)


class CategoryListView(APIView):
    @extend_schema(
        responses={
            200: CategorySerializer(many=True),
            403: FORBIDDEN_RESPONSE,
            500: INTERNAL_ERROR_RESPONSE,
        }
    )
    def get(self, request: Request) -> Response:
        counts = dict(
            Note.objects.filter(owner=request.user)
            .values("category")
            .annotate(note_count=Count("id"))
            .values_list("category", "note_count")
        )
        categories = [{"key": key, "note_count": counts.get(key, 0)} for key in CategoryKey.values]
        return Response(CategorySerializer(categories, many=True).data)


@extend_schema_view(
    get=extend_schema(
        parameters=[NoteListQuerySerializer],
        responses={
            200: NoteListSerializer(many=True),
            400: BAD_REQUEST_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            500: INTERNAL_ERROR_RESPONSE,
        },
    ),
    post=extend_schema(
        request=NoteCreateSerializer,
        parameters=[
            CSRF_HEADER_PARAMETER,
            IDEMPOTENCY_KEY_PARAMETER,
            LOCATION_RESPONSE_HEADER,
            IDEMPOTENCY_REPLAYED_RESPONSE_HEADER,
        ],
        responses={
            201: NoteDetailSerializer,
            400: BAD_REQUEST_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            409: CONFLICT_RESPONSE,
            413: PAYLOAD_TOO_LARGE_RESPONSE,
            415: UNSUPPORTED_MEDIA_TYPE_RESPONSE,
            500: INTERNAL_ERROR_RESPONSE,
        },
    ),
)
class NoteListCreateView(generics.ListCreateAPIView):
    pagination_class = NotePagination

    def get_queryset(self):
        query_serializer = NoteListQuerySerializer(data=self.request.query_params)
        query_serializer.is_valid(raise_exception=True)
        queryset = (
            Note.objects.filter(owner=self.request.user)
            .annotate(content_preview=Substr("content", 1, NOTE_CONTENT_PREVIEW_LENGTH))
            .defer("content")
        )
        category_key = query_serializer.validated_data.get("category")
        if category_key:
            queryset = queryset.filter(category=category_key)
        return queryset

    def get_serializer_class(self):
        if self.request.method == "POST":
            return NoteCreateSerializer
        return NoteListSerializer

    def create(self, request: Request, *args, **kwargs) -> Response:
        del args, kwargs
        input_serializer = NoteCreateSerializer(data=request.data, context={"request": request})
        input_serializer.is_valid(raise_exception=True)
        raw_idempotency_key = request.headers.get("Idempotency-Key")
        header_data = (
            {"idempotency_key": raw_idempotency_key} if raw_idempotency_key is not None else {}
        )
        header_serializer = NoteCreateHeadersSerializer(data=header_data)
        header_serializer.is_valid(raise_exception=True)
        category = input_serializer.validated_data.get("category", CategoryKey.RANDOM_THOUGHTS)
        try:
            result = create_note(
                owner_id=request.user.id,
                category=category,
                idempotency_key=header_serializer.validated_data.get("idempotency_key"),
            )
        except IdempotencyConflictError as exc:
            return Response(
                {"code": exc.code, "detail": exc.detail},
                status=status.HTTP_409_CONFLICT,
            )
        output = NoteCreationSnapshotSerializer(result.snapshot, context={"request": request})
        response = Response(output.data, status=status.HTTP_201_CREATED)
        response["Location"] = reverse("notes:note-detail", args=[result.snapshot.id])
        if result.replayed:
            response["Idempotency-Replayed"] = "true"
        return response


@extend_schema_view(
    get=extend_schema(
        responses={
            200: NoteDetailSerializer,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
            500: INTERNAL_ERROR_RESPONSE,
        }
    ),
    patch=extend_schema(
        request=NotePatchSerializer,
        parameters=[CSRF_HEADER_PARAMETER],
        responses={
            200: NoteDetailSerializer,
            400: BAD_REQUEST_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
            409: OpenApiResponse(
                response=RevisionConflictErrorSerializer,
                description="Revision conflict",
            ),
            413: PAYLOAD_TOO_LARGE_RESPONSE,
            415: UNSUPPORTED_MEDIA_TYPE_RESPONSE,
            500: INTERNAL_ERROR_RESPONSE,
        },
    ),
    delete=extend_schema(
        parameters=[CSRF_HEADER_PARAMETER],
        responses={
            204: None,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
            500: INTERNAL_ERROR_RESPONSE,
        },
    ),
)
class NoteDetailView(generics.RetrieveDestroyAPIView):
    serializer_class = NoteDetailSerializer
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return Note.objects.filter(owner=self.request.user)

    def patch(self, request: Request, *args, **kwargs) -> Response:
        del args
        serializer = NotePatchSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        changes = dict(serializer.validated_data)
        expected_revision = changes.pop("revision")
        try:
            updated_note = update_note(
                owner_id=request.user.id,
                note_id=kwargs["pk"],
                expected_revision=expected_revision,
                **changes,
            )
        except Note.DoesNotExist as exc:
            raise Http404 from exc
        except RevisionConflictError as exc:
            current = RevisionConflictCurrentSerializer(exc.current).data
            return Response(
                {"code": exc.code, "detail": exc.detail, "current": current},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(NoteDetailSerializer(updated_note, context={"request": request}).data)
