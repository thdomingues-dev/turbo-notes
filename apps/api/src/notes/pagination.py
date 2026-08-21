from base64 import b64decode, b64encode
from binascii import Error as BinasciiError
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import parse_qsl, urlencode
from uuid import UUID

from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.utils.urls import replace_query_param

from notes.constants import NOTE_LIST_DEFAULT_LIMIT


@dataclass(frozen=True, slots=True)
class NoteCursor:
    last_edited_at: datetime
    note_id: UUID
    reverse: bool = False


class NotePagination(CursorPagination):
    """Keyset pagination over the complete, unique note ordering."""

    page_size = NOTE_LIST_DEFAULT_LIMIT
    ordering = ("-last_edited_at", "-id")
    cursor_fields = frozenset(("p", "i", "r"))

    def get_schema_operation_parameters(self, view):
        del view
        # NoteListQuerySerializer documents and validates these parameters.
        return []

    def paginate_queryset(self, queryset, request, view=None):
        del view
        self.request = request
        self.page_size = self.get_page_size(request)
        if not self.page_size:
            return None

        self.base_url = request.build_absolute_uri()
        self.cursor = self.decode_cursor(request)
        reverse = self.cursor.reverse if self.cursor is not None else False

        if self.cursor is not None:
            boundary = Q(last_edited_at=self.cursor.last_edited_at)
            if reverse:
                queryset = queryset.filter(
                    Q(last_edited_at__gt=self.cursor.last_edited_at)
                    | (boundary & Q(id__gt=self.cursor.note_id))
                )
            else:
                queryset = queryset.filter(
                    Q(last_edited_at__lt=self.cursor.last_edited_at)
                    | (boundary & Q(id__lt=self.cursor.note_id))
                )

        query_ordering = (
            tuple(field.lstrip("-") for field in self.ordering) if reverse else self.ordering
        )
        results = list(queryset.order_by(*query_ordering)[: self.page_size + 1])
        has_extra_page = len(results) > self.page_size
        self.page = results[: self.page_size]
        if reverse:
            self.page.reverse()

        # These names follow the links in the canonical descending result order.
        self.has_next = has_extra_page if not reverse else True
        self.has_previous = self.cursor is not None if not reverse else has_extra_page
        return self.page

    def get_next_link(self):
        if not self.has_next:
            return None
        cursor = self._cursor_from_page_edge(index=-1, reverse=False)
        return self.encode_cursor(cursor) if cursor is not None else None

    def get_previous_link(self):
        if not self.has_previous:
            return None
        cursor = self._cursor_from_page_edge(index=0, reverse=True)
        return self.encode_cursor(cursor) if cursor is not None else None

    def _cursor_from_page_edge(self, *, index: int, reverse: bool) -> NoteCursor | None:
        if self.page:
            note = self.page[index]
            return NoteCursor(
                last_edited_at=note.last_edited_at,
                note_id=note.id,
                reverse=reverse,
            )
        if self.cursor is None:
            return None
        return NoteCursor(
            last_edited_at=self.cursor.last_edited_at,
            note_id=self.cursor.note_id,
            reverse=reverse,
        )

    def encode_cursor(self, cursor: NoteCursor) -> str:
        encoded = self._encoded_cursor_value(cursor)
        return replace_query_param(self.base_url, self.cursor_query_param, encoded)

    def decode_cursor(self, request) -> NoteCursor | None:
        encoded = request.query_params.get(self.cursor_query_param)
        if encoded is None:
            return None

        try:
            query = b64decode(encoded.encode("ascii"), validate=True).decode("ascii")
            pairs = parse_qsl(query, keep_blank_values=True, strict_parsing=True)
            field_names = [field for field, _ in pairs]
            values = dict(pairs)
            if (
                len(field_names) != len(set(field_names))
                or not set(field_names) <= self.cursor_fields
                or set(field_names) not in ({"p", "i"}, {"p", "i", "r"})
                or ("r" in values and values["r"] != "1")
            ):
                raise ValueError

            last_edited_at = parse_datetime(values["p"])
            if (
                last_edited_at is None
                or not timezone.is_aware(last_edited_at)
                or last_edited_at.isoformat() != values["p"]
            ):
                raise ValueError
            note_id = UUID(values["i"])
            if str(note_id) != values["i"]:
                raise ValueError

            cursor = NoteCursor(
                last_edited_at=last_edited_at,
                note_id=note_id,
                reverse="r" in values,
            )
            if encoded != self._encoded_cursor_value(cursor):
                raise ValueError
        except (BinasciiError, KeyError, UnicodeError, ValueError) as exc:
            raise ValidationError({"cursor": ["Invalid cursor."]}) from exc
        return cursor

    @staticmethod
    def _encoded_cursor_value(cursor: NoteCursor) -> str:
        tokens = [
            ("p", cursor.last_edited_at.isoformat()),
            ("i", str(cursor.note_id)),
        ]
        if cursor.reverse:
            tokens.append(("r", "1"))
        query = urlencode(tokens)
        return b64encode(query.encode("ascii")).decode("ascii")
