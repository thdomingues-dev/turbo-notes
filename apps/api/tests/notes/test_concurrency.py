import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from django.db import close_old_connections

from accounts.models import User
from accounts.services import create_account
from notes.models import Note, NoteCreationRequest
from notes.services import RevisionConflictError, create_note, update_note


@pytest.mark.django_db(transaction=True)
def test_concurrent_updates_allow_exactly_one_writer():
    user = create_account(
        email="concurrency@example.com",
        password="Correct-Horse-Battery-Fixture!",
    )
    note = Note.objects.create(owner=user)
    barrier = Barrier(2)

    def write(title: str) -> str:
        close_old_connections()
        thread_user = User.objects.get(id=user.id)
        barrier.wait(timeout=5)
        try:
            update_note(
                owner_id=thread_user.id,
                note_id=note.id,
                expected_revision=0,
                title=title,
            )
        except RevisionConflictError:
            result = "conflict"
        else:
            result = "saved"
        finally:
            close_old_connections()
        return result

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(write, ("Writer one", "Writer two")))

    assert sorted(results) == ["conflict", "saved"]
    note.refresh_from_db()
    assert note.revision == 1
    assert note.title in {"Writer one", "Writer two"}


@pytest.mark.django_db(transaction=True)
def test_concurrent_creations_with_one_idempotency_key_return_one_note():
    user = create_account(
        email="idempotency@example.com",
        password="Correct-Horse-Battery-Fixture!",
    )
    idempotency_key = uuid.uuid4()
    barrier = Barrier(2)

    def create() -> tuple[str, bool]:
        close_old_connections()
        barrier.wait(timeout=5)
        try:
            result = create_note(
                owner_id=user.id,
                category="school",
                idempotency_key=idempotency_key,
            )
            return str(result.snapshot.id), result.replayed
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: create(), range(2)))

    assert len({note_id for note_id, _ in results}) == 1
    assert sorted(replayed for _, replayed in results) == [False, True]
    assert Note.objects.filter(owner=user).count() == 1
    assert NoteCreationRequest.objects.filter(owner=user).count() == 1
