import uuid
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from django.db import IntegrityError, transaction
from django.utils import timezone

from notes.models import Note, NoteCreationRequest


class RevisionConflictError(Exception):
    code = "revision_conflict"
    detail = "The note was changed by another request."

    def __init__(self, current: Note) -> None:
        self.current = current
        super().__init__(self.detail)


class IdempotencyConflictError(Exception):
    code = "idempotency_conflict"
    detail = "This idempotency key was already used for a different request."


@dataclass(frozen=True, slots=True)
class NoteCreationSnapshot:
    """The immutable representation returned by the note creation endpoint."""

    id: UUID
    category_key: str
    title: str
    content: str
    revision: int
    created_at: datetime
    last_edited_at: datetime


@dataclass(frozen=True, slots=True)
class NoteCreationResult:
    snapshot: NoteCreationSnapshot
    replayed: bool


def create_note(
    *,
    owner_id: UUID,
    category: str,
    idempotency_key: UUID | None = None,
) -> NoteCreationResult:
    """Create once for a supplied key and report whether this was a replay."""
    if idempotency_key is None:
        note = Note.objects.create(owner_id=owner_id, category=category)
        return NoteCreationResult(snapshot=_snapshot_from_note(note), replayed=False)

    note_id = uuid.uuid4()
    created_at = timezone.now()
    try:
        with transaction.atomic():
            NoteCreationRequest.objects.create(
                owner_id=owner_id,
                key=idempotency_key,
                category=category,
                note_id=note_id,
                created_at=created_at,
            )
            note = Note.objects.create(
                id=note_id,
                owner_id=owner_id,
                category=category,
                created_at=created_at,
                last_edited_at=created_at,
            )
    except IntegrityError:
        # Another request with the same owner/key may have committed first.
        receipt = NoteCreationRequest.objects.filter(
            owner_id=owner_id,
            key=idempotency_key,
        ).first()
        if receipt is None:
            raise
        return NoteCreationResult(
            snapshot=_snapshot_from_creation_receipt(receipt, category),
            replayed=True,
        )
    return NoteCreationResult(snapshot=_snapshot_from_note(note), replayed=False)


def _snapshot_from_note(note: Note) -> NoteCreationSnapshot:
    return NoteCreationSnapshot(
        id=note.id,
        category_key=note.category,
        title=note.title,
        content=note.content,
        revision=note.revision,
        created_at=note.created_at,
        last_edited_at=note.last_edited_at,
    )


def _snapshot_from_creation_receipt(
    receipt: NoteCreationRequest,
    requested_category: str,
) -> NoteCreationSnapshot:
    if receipt.category != requested_category:
        raise IdempotencyConflictError
    # Reconstruct the original response, even if the note was later edited or deleted.
    return NoteCreationSnapshot(
        id=receipt.note_id,
        category_key=receipt.category,
        title="",
        content="",
        revision=0,
        created_at=receipt.created_at,
        last_edited_at=receipt.created_at,
    )


@transaction.atomic
def update_note(
    *,
    owner_id: UUID,
    note_id: UUID,
    expected_revision: int,
    category: str | None = None,
    title: str | None = None,
    content: str | None = None,
) -> Note:
    note = Note.objects.select_for_update().get(id=note_id, owner_id=owner_id)

    if note.revision != expected_revision:
        raise RevisionConflictError(note)

    changed_fields: list[str] = []
    if title is not None and note.title != title:
        note.title = title
        changed_fields.append("title")
    if content is not None and note.content != content:
        note.content = content
        changed_fields.append("content")
    if category is not None and note.category != category:
        note.category = category
        changed_fields.append("category")

    if not changed_fields:
        return note

    note.revision += 1
    note.last_edited_at = timezone.now()
    note.save(update_fields=[*changed_fields, "revision", "last_edited_at"])
    return note
