import json
import uuid
from base64 import b64decode, b64encode
from dataclasses import FrozenInstanceError
from unittest.mock import patch
from urllib.parse import parse_qs, urlencode, urlparse

import pytest
from django.db import IntegrityError, transaction
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from notes.models import Note, NoteCreationRequest
from notes.services import NoteCreationResult, NoteCreationSnapshot, create_note

pytestmark = pytest.mark.django_db

PASSWORD = "Correct-Horse-Battery-Fixture!"
VALID_CURSOR_TIMESTAMP = "2001-04-17T12:00:00+00:00"
VALID_CURSOR_NOTE_ID = "00000000-0000-0000-0000-000000000001"


def create_note_for(user, *, category_key="random-thoughts", **fields):
    return Note.objects.create(owner=user, category=category_key, **fields)


def encode_cursor_tokens(tokens: list[tuple[str, str]]) -> str:
    return b64encode(urlencode(tokens).encode()).decode()


def test_note_endpoints_require_authentication(api_client):
    assert api_client.get(reverse("notes:category-list")).status_code == 403
    assert api_client.get(reverse("notes:note-list")).status_code == 403


def test_valid_large_multilingual_note_is_persisted(authenticated_client, user):
    note = create_note_for(user)
    content = "漢" * 90_000
    body = json.dumps(
        {"revision": note.revision, "content": content},
        ensure_ascii=False,
    ).encode()

    response = authenticated_client.generic(
        "PATCH",
        reverse("notes:note-detail", args=[note.id]),
        data=body,
        content_type="application/json",
    )

    assert len(body) == 270_030
    assert response.status_code == 200
    assert response.data["content"] == content
    note.refresh_from_db()
    assert note.content == content


def test_cookie_authenticated_note_writes_require_csrf(user):
    client = APIClient(enforce_csrf_checks=True)
    session = client.get(reverse("accounts:session"))
    logged_in = client.post(
        reverse("accounts:login"),
        {"email": user.email, "password": PASSWORD},
        format="json",
        HTTP_X_CSRFTOKEN=session.data["csrf_token"],
    )
    assert logged_in.status_code == 200

    rejected = client.post(reverse("notes:note-list"), {}, format="json")
    accepted = client.post(
        reverse("notes:note-list"),
        {},
        format="json",
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
    )

    assert rejected.status_code == 403
    assert rejected.data == {
        "code": "csrf_failed",
        "detail": "CSRF verification failed.",
    }
    assert accepted.status_code == 201

    delete_url = reverse("notes:note-detail", args=[accepted.data["id"]])
    rejected_delete = client.delete(delete_url)
    accepted_delete = client.delete(
        delete_url,
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
    )

    assert rejected_delete.status_code == 403
    assert rejected_delete.data["code"] == "csrf_failed"
    assert accepted_delete.status_code == 204


def test_category_list_is_fixed_ordered_and_has_owner_scoped_counts(
    authenticated_client, user, other_user
):
    create_note_for(user, category_key="school")
    create_note_for(user, category_key="school")
    create_note_for(user, category_key="drama")
    create_note_for(other_user, category_key="school")
    create_note_for(other_user, category_key="drama")

    response = authenticated_client.get(reverse("notes:category-list"))

    assert response.status_code == 200
    assert response.data == [
        {"key": "random-thoughts", "note_count": 0},
        {"key": "school", "note_count": 2},
        {"key": "personal", "note_count": 0},
        {"key": "drama", "note_count": 1},
    ]


def test_note_creation_is_immediate_and_uses_slug_contract(authenticated_client, user):
    response = authenticated_client.post(
        reverse("notes:note-list"), {"category_key": "drama"}, format="json"
    )

    assert response.status_code == 201
    assert set(response.data) == {
        "id",
        "title",
        "content",
        "category_key",
        "revision",
        "created_at",
        "last_edited_at",
    }
    assert response.data["title"] == ""
    assert response.data["content"] == ""
    assert response.data["revision"] == 0
    assert response.data["category_key"] == "drama"
    assert response["Location"].endswith(f"/api/v1/notes/{response.data['id']}/")
    assert Note.objects.filter(owner=user).count() == 1


def test_note_creation_replays_the_same_idempotency_key_without_a_duplicate(
    authenticated_client, user
):
    idempotency_key = str(uuid.uuid4())
    url = reverse("notes:note-list")

    created = authenticated_client.post(
        url,
        {"category_key": "school"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=idempotency_key,
    )
    replayed = authenticated_client.post(
        url,
        {"category_key": "school"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=idempotency_key,
    )

    assert created.status_code == 201
    assert replayed.status_code == 201
    assert replayed.data == created.data
    assert replayed["Idempotency-Replayed"] == "true"
    assert Note.objects.filter(owner=user).count() == 1


def test_note_creation_receipt_survives_edit_and_deletion(authenticated_client, user):
    idempotency_key = str(uuid.uuid4())
    url = reverse("notes:note-list")
    created = authenticated_client.post(
        url,
        {"category_key": "school"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=idempotency_key,
    )
    note = Note.objects.get(owner=user)
    note.title = "Edited after creation"
    note.revision = 1
    note.save(update_fields=["title", "revision"])
    note.delete()

    replayed = authenticated_client.post(
        url,
        {"category_key": "school"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=idempotency_key,
    )

    assert replayed.status_code == 201
    assert replayed.data == created.data
    assert replayed["Idempotency-Replayed"] == "true"
    assert not Note.objects.filter(owner=user).exists()
    assert NoteCreationRequest.objects.filter(owner=user).count() == 1


def test_note_creation_rejects_reusing_a_key_for_different_input(authenticated_client, user):
    idempotency_key = str(uuid.uuid4())
    url = reverse("notes:note-list")
    authenticated_client.post(
        url,
        {"category_key": "school"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=idempotency_key,
    )

    response = authenticated_client.post(
        url,
        {"category_key": "personal"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=idempotency_key,
    )

    assert response.status_code == 409
    assert response.data["code"] == "idempotency_conflict"
    assert Note.objects.filter(owner=user).count() == 1


def test_note_creation_keys_are_scoped_to_the_owner(user, other_user):
    idempotency_key = uuid.uuid4()

    first = create_note(
        owner_id=user.id,
        category="school",
        idempotency_key=idempotency_key,
    )
    second = create_note(
        owner_id=other_user.id,
        category="school",
        idempotency_key=idempotency_key,
    )

    assert first.snapshot.id != second.snapshot.id
    assert first.replayed is False
    assert second.replayed is False
    assert NoteCreationRequest.objects.filter(key=idempotency_key).count() == 2


def test_note_creation_returns_an_immutable_non_orm_snapshot(user):
    result = create_note(owner_id=user.id, category="school")

    assert isinstance(result, NoteCreationResult)
    assert isinstance(result.snapshot, NoteCreationSnapshot)
    assert not isinstance(result.snapshot, Note)
    assert result.snapshot.category_key == "school"
    with pytest.raises(FrozenInstanceError):
        result.snapshot.title = "Cannot resurrect or mutate this snapshot"


def test_note_creation_service_replays_the_same_snapshot_after_deletion(user):
    idempotency_key = uuid.uuid4()
    created = create_note(
        owner_id=user.id,
        category="school",
        idempotency_key=idempotency_key,
    )
    Note.objects.filter(id=created.snapshot.id).delete()

    replayed = create_note(
        owner_id=user.id,
        category="school",
        idempotency_key=idempotency_key,
    )

    assert isinstance(replayed, NoteCreationResult)
    assert replayed.snapshot == created.snapshot
    assert created.replayed is False
    assert replayed.replayed is True
    assert not Note.objects.filter(id=created.snapshot.id).exists()


def test_note_creation_failure_rolls_back_its_idempotency_receipt(user):
    idempotency_key = uuid.uuid4()

    with (
        patch("notes.services.Note.objects.create", side_effect=IntegrityError("failed")),
        pytest.raises(IntegrityError, match="failed"),
    ):
        create_note(
            owner_id=user.id,
            category="school",
            idempotency_key=idempotency_key,
        )

    assert not NoteCreationRequest.objects.filter(
        owner=user,
        key=idempotency_key,
    ).exists()


def test_note_creation_rejects_a_malformed_idempotency_key(authenticated_client, user):
    response = authenticated_client.post(
        reverse("notes:note-list"),
        {},
        format="json",
        HTTP_IDEMPOTENCY_KEY="not-a-uuid",
    )

    assert response.status_code == 400
    assert "idempotency_key" in response.data["errors"]
    assert not Note.objects.filter(owner=user).exists()


def test_note_creation_defaults_to_random_thoughts(authenticated_client):
    response = authenticated_client.post(reverse("notes:note-list"), {}, format="json")

    assert response.status_code == 201
    assert response.data["category_key"] == "random-thoughts"


def test_note_creation_rejects_invalid_category(authenticated_client, user):
    response = authenticated_client.post(
        reverse("notes:note-list"), {"category_key": "not-a-category"}, format="json"
    )

    assert response.status_code == 400
    assert response.data["errors"] == {"category_key": ["Invalid category."]}
    assert not Note.objects.filter(owner=user).exists()


def test_note_create_rejects_unknown_fields(authenticated_client):
    response = authenticated_client.post(
        reverse("notes:note-list"), {"unexpected": "value"}, format="json"
    )

    assert response.status_code == 400
    assert response.data["errors"] == {"unexpected": ["Unknown field."]}


def test_note_list_is_cursor_paginated_scoped_filtered_and_uses_preview(
    authenticated_client, user, other_user
):
    long_content = "a" * 100_000
    school_note = create_note_for(user, category_key="school", title="School", content=long_content)
    create_note_for(user, category_key="personal", title="Personal")
    create_note_for(other_user, category_key="school", title="Other user")

    response = authenticated_client.get(reverse("notes:note-list"), {"category": "school"})

    assert response.status_code == 200
    assert set(response.data) == {"next", "previous", "results"}
    assert response.data["next"] is None
    assert response.data["results"] == [
        {
            "id": str(school_note.id),
            "title": "School",
            "content_preview": "a" * 500,
            "category_key": "school",
            "last_edited_at": school_note.last_edited_at.isoformat().replace("+00:00", "Z"),
        }
    ]


def test_note_list_loads_the_next_cursor_page(authenticated_client, user):
    notes = [create_note_for(user, title=f"Note {index}") for index in range(11)]
    create_note_for(user, category_key="personal", title="Filtered out")

    first_page = authenticated_client.get(
        reverse("notes:note-list"), {"category": "random-thoughts"}
    )
    next_query = parse_qs(urlparse(first_page.data["next"]).query)
    second_page = authenticated_client.get(first_page.data["next"])
    previous_page = authenticated_client.get(second_page.data["previous"])

    assert first_page.status_code == 200
    assert len(first_page.data["results"]) == 9
    assert next_query["category"] == ["random-thoughts"]
    assert len(next_query["cursor"]) == 1
    assert set(next_query) == {"category", "cursor"}
    assert set(parse_qs(b64decode(next_query["cursor"][0]).decode())) == {"p", "i"}
    assert second_page.status_code == 200
    assert len(second_page.data["results"]) == 2
    assert second_page.data["previous"] is not None
    assert previous_page.status_code == 200
    assert previous_page.data["results"] == first_page.data["results"]
    returned_ids = {
        item["id"] for page in (first_page, second_page) for item in page.data["results"]
    }
    assert returned_ids == {str(note.id) for note in notes}


def test_cursor_page_boundary_is_stable_when_a_seen_note_is_deleted(authenticated_client, user):
    notes = [create_note_for(user, title=f"Note {index}") for index in range(11)]
    first_page = authenticated_client.get(reverse("notes:note-list"))
    first_ids = {item["id"] for item in first_page.data["results"]}
    deleted_id = first_page.data["results"][0]["id"]

    Note.objects.filter(id=deleted_id).delete()
    second_page = authenticated_client.get(first_page.data["next"])

    second_ids = {item["id"] for item in second_page.data["results"]}
    expected_remaining_ids = {str(note.id) for note in notes} - first_ids
    assert second_page.status_code == 200
    assert second_ids == expected_remaining_ids
    assert first_ids.isdisjoint(second_ids)


def test_cursor_page_boundary_is_stable_when_timestamps_are_tied(authenticated_client, user):
    timestamp = timezone.now()
    notes = Note.objects.bulk_create(
        [
            Note(
                owner=user,
                title=f"Note {index}",
                created_at=timestamp,
                last_edited_at=timestamp,
            )
            for index in range(11)
        ]
    )
    first_page = authenticated_client.get(reverse("notes:note-list"))
    first_ids = {item["id"] for item in first_page.data["results"]}
    unseen_ids = {str(note.id) for note in notes} - first_ids

    Note.objects.filter(id=first_page.data["results"][0]["id"]).delete()
    second_page = authenticated_client.get(first_page.data["next"])

    assert second_page.status_code == 200
    assert {item["id"] for item in second_page.data["results"]} == unseen_ids


def test_tied_cursor_pages_can_be_traversed_forward_and_backward(authenticated_client, user):
    timestamp = timezone.now()
    notes = Note.objects.bulk_create(
        [
            Note(
                owner=user,
                title=f"Note {index}",
                created_at=timestamp,
                last_edited_at=timestamp,
            )
            for index in range(29)
        ]
    )

    pages = []
    response = authenticated_client.get(reverse("notes:note-list"))
    while True:
        assert response.status_code == 200
        pages.append(response.data)
        if response.data["next"] is None:
            break
        response = authenticated_client.get(response.data["next"])

    returned_ids = [item["id"] for page in pages for item in page["results"]]
    assert len(returned_ids) == len(set(returned_ids)) == len(notes)
    assert set(returned_ids) == {str(note.id) for note in notes}

    previous_url = pages[-1]["previous"]
    for expected_index in reversed(range(len(pages) - 1)):
        response = authenticated_client.get(previous_url)
        assert response.status_code == 200
        assert response.data["results"] == pages[expected_index]["results"]

        forward_again = authenticated_client.get(response.data["next"])
        assert forward_again.status_code == 200
        assert forward_again.data["results"] == pages[expected_index + 1]["results"]
        previous_url = response.data["previous"]
    assert previous_url is None


@pytest.mark.parametrize(
    ("query", "field"),
    [
        ({"category": "not-a-category"}, "category"),
        ({"cursor": ""}, "cursor"),
        ({"cursor": "not-a-valid-cursor"}, "cursor"),
        ({"cursor": "!!!!"}, "cursor"),
        ({"cursor": b64encode(b"x=1").decode()}, "cursor"),
        ({"cursor": b64encode(b"r=2").decode()}, "cursor"),
        ({"cursor": b64encode(b"r=invalid").decode()}, "cursor"),
        ({"cursor": b64encode(b"p=garbage").decode()}, "cursor"),
        ({"cursor": b64encode(b"p=2003-02-31").decode()}, "cursor"),
        ({"cursor": b64encode(b"p=").decode()}, "cursor"),
        ({"cursor": b64encode(b"o=1&o=2").decode()}, "cursor"),
        (
            {"cursor": encode_cursor_tokens([("p", VALID_CURSOR_TIMESTAMP), ("i", "not-a-uuid")])},
            "cursor",
        ),
        (
            {
                "cursor": encode_cursor_tokens(
                    [("p", "2001-04-17T12:00:00"), ("i", VALID_CURSOR_NOTE_ID)]
                )
            },
            "cursor",
        ),
        (
            {
                "cursor": encode_cursor_tokens(
                    [
                        ("p", VALID_CURSOR_TIMESTAMP),
                        ("i", VALID_CURSOR_NOTE_ID),
                        ("r", "2"),
                    ]
                )
            },
            "cursor",
        ),
        (
            {
                "cursor": encode_cursor_tokens(
                    [
                        ("p", VALID_CURSOR_TIMESTAMP),
                        ("i", VALID_CURSOR_NOTE_ID),
                        ("i", "00000000-0000-0000-0000-000000000002"),
                    ]
                )
            },
            "cursor",
        ),
        (
            {
                "cursor": encode_cursor_tokens(
                    [
                        ("p", VALID_CURSOR_TIMESTAMP),
                        ("i", VALID_CURSOR_NOTE_ID),
                        ("o", "1"),
                    ]
                )
            },
            "cursor",
        ),
        ({"limit": 9}, "limit"),
        ({"offset": 0}, "offset"),
        ({"unknown": "value"}, "unknown"),
    ],
)
def test_note_list_rejects_invalid_query_parameters(authenticated_client, query, field):
    response = authenticated_client.get(reverse("notes:note-list"), query)

    assert response.status_code == 400
    assert response.data["code"] == "validation_error"
    assert field in response.data["errors"]


@pytest.mark.parametrize(
    ("query_string", "field"),
    [
        ("category=school&category=personal", "category"),
        ("cursor=first&cursor=second", "cursor"),
    ],
)
def test_note_list_rejects_repeated_query_parameters(authenticated_client, query_string, field):
    response = authenticated_client.get(f"{reverse('notes:note-list')}?{query_string}")

    assert response.status_code == 400
    assert response.data["errors"] == {
        field: ["Provide this query parameter once."],
    }


def test_detail_and_patch_are_owner_scoped(authenticated_client, user, other_user):
    own_note = create_note_for(user, title="Mine")
    foreign_note = create_note_for(other_user, title="Secret")

    own = authenticated_client.get(reverse("notes:note-detail", args=[own_note.id]))
    foreign = authenticated_client.get(reverse("notes:note-detail", args=[foreign_note.id]))
    foreign_patch = authenticated_client.patch(
        reverse("notes:note-detail", args=[foreign_note.id]),
        {"revision": 0, "title": "Stolen"},
        format="json",
    )

    assert own.status_code == 200
    assert foreign.status_code == 404
    assert foreign_patch.status_code == 404
    foreign_note.refresh_from_db()
    assert foreign_note.title == "Secret"


def test_delete_is_owner_scoped_and_returns_empty_204(authenticated_client, user, other_user):
    own_note = create_note_for(user, title="Mine")
    foreign_note = create_note_for(other_user, title="Secret")

    foreign = authenticated_client.delete(reverse("notes:note-detail", args=[foreign_note.id]))
    deleted = authenticated_client.delete(reverse("notes:note-detail", args=[own_note.id]))

    assert foreign.status_code == 404
    assert deleted.status_code == 204
    assert deleted.content == b""
    assert not Note.objects.filter(id=own_note.id).exists()
    assert Note.objects.filter(id=foreign_note.id).exists()


def test_patch_updates_changed_fields_revision_and_last_edited_time(authenticated_client, user):
    note = create_note_for(user, title="Before", content="Old")
    original_time = note.last_edited_at

    response = authenticated_client.patch(
        reverse("notes:note-detail", args=[note.id]),
        {
            "revision": 0,
            "title": "After",
            "content": "New",
            "category_key": "personal",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["revision"] == 1
    assert response.data["title"] == "After"
    assert response.data["content"] == "New"
    assert response.data["category_key"] == "personal"
    note.refresh_from_db()
    assert note.revision == 1
    assert note.last_edited_at > original_time


def test_patch_preserves_content_whitespace(authenticated_client, user):
    note = create_note_for(user)
    content = "  first line\n\nlast line  "

    response = authenticated_client.patch(
        reverse("notes:note-detail", args=[note.id]),
        {"revision": 0, "content": content},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["content"] == content


def test_patch_normalizes_title_and_does_not_revise_a_no_op(authenticated_client, user):
    note = create_note_for(user, title="Before")
    url = reverse("notes:note-detail", args=[note.id])

    normalized = authenticated_client.patch(
        url, {"revision": 0, "title": "  Normalized title  "}, format="json"
    )
    no_op = authenticated_client.patch(
        url, {"revision": 1, "title": "Normalized title"}, format="json"
    )

    assert normalized.status_code == 200
    assert normalized.data["title"] == "Normalized title"
    assert normalized.data["revision"] == 1
    assert no_op.status_code == 200
    assert no_op.data["revision"] == 1
    assert no_op.data["last_edited_at"] == normalized.data["last_edited_at"]


def test_patch_with_stale_revision_returns_409_without_overwrite(authenticated_client, user):
    note = create_note_for(user, title="Original")
    detail_url = reverse("notes:note-detail", args=[note.id])
    first = authenticated_client.patch(
        detail_url, {"revision": 0, "title": "First writer"}, format="json"
    )
    stale = authenticated_client.patch(
        detail_url, {"revision": 0, "title": "Stale writer"}, format="json"
    )

    assert first.status_code == 200
    assert stale.status_code == 409
    assert stale.data["code"] == "revision_conflict"
    assert stale.data["current"]["revision"] == 1
    note.refresh_from_db()
    assert note.title == "First writer"


@pytest.mark.parametrize("stale_revision", [0, 999])
def test_patch_with_any_stale_revision_conflicts_even_when_values_match(
    authenticated_client,
    user,
    stale_revision,
):
    note = create_note_for(user, title="Before", content="Old")
    detail_url = reverse("notes:note-detail", args=[note.id])
    payload = {"revision": 0, "title": "After", "content": "New"}

    first = authenticated_client.patch(detail_url, payload, format="json")
    stale = authenticated_client.patch(
        detail_url,
        {**payload, "revision": stale_revision},
        format="json",
    )

    assert first.status_code == 200
    assert stale.status_code == 409
    assert stale.data["code"] == "revision_conflict"
    assert stale.data["current"]["revision"] == 1
    note.refresh_from_db()
    assert note.revision == 1


def test_patch_rejects_missing_revision_empty_changes_and_oversized_content(
    authenticated_client, user
):
    note = create_note_for(user)
    url = reverse("notes:note-detail", args=[note.id])

    missing_revision = authenticated_client.patch(url, {"title": "No revision"}, format="json")
    missing_change = authenticated_client.patch(url, {"revision": 0}, format="json")
    oversized = authenticated_client.patch(
        url, {"revision": 0, "content": "x" * 100_001}, format="json"
    )

    assert missing_revision.status_code == 400
    assert missing_change.status_code == 400
    assert "non_field_errors" in missing_change.data["errors"]
    assert oversized.status_code == 400


def test_patch_rejects_unknown_fields_without_updating_note(authenticated_client, user):
    note = create_note_for(user, title="Before")

    response = authenticated_client.patch(
        reverse("notes:note-detail", args=[note.id]),
        {"revision": 0, "title": "After", "unexpected": "ignored no more"},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["errors"] == {"unexpected": ["Unknown field."]}
    note.refresh_from_db()
    assert note.title == "Before"


def test_database_enforces_category_and_content_invariants(user):
    with pytest.raises(IntegrityError), transaction.atomic():
        create_note_for(user, category_key="not-a-category")

    with pytest.raises(IntegrityError), transaction.atomic():
        create_note_for(user, content="x" * 100_001)

    with pytest.raises(IntegrityError), transaction.atomic():
        NoteCreationRequest.objects.create(
            owner=user,
            key=uuid.uuid4(),
            category="not-a-category",
            note_id=uuid.uuid4(),
        )
