import uuid

import pytest
from django.db import IntegrityError, connection, migrations, transaction
from django.db.migrations.executor import MigrationExecutor

from accounts.models import User
from notes.constants import NOTE_CONTENT_MAX_LENGTH
from notes.models import Note, NoteCreationRequest

pytestmark = pytest.mark.django_db(transaction=True)

INITIAL_MIGRATION = ("notes", "0001_initial")


def table_columns(table_name: str) -> set[str]:
    with connection.cursor() as cursor:
        return {
            column.name
            for column in connection.introspection.get_table_description(cursor, table_name)
        }


def table_constraints(table_name: str) -> dict[str, dict]:
    with connection.cursor() as cursor:
        return connection.introspection.get_constraints(cursor, table_name)


def test_notes_have_one_clean_initial_migration_matching_the_current_models():
    executor = MigrationExecutor(connection)
    disk_migrations = {
        migration_name
        for app_label, migration_name in executor.loader.disk_migrations
        if app_label == "notes"
    }
    migration = executor.loader.disk_migrations[INITIAL_MIGRATION]
    state = executor.loader.project_state([INITIAL_MIGRATION])
    historical_note = state.apps.get_model("notes", "Note")
    historical_receipt = state.apps.get_model("notes", "NoteCreationRequest")

    assert disk_migrations == {"0001_initial"}
    assert migration.initial is True
    assert all(isinstance(operation, migrations.CreateModel) for operation in migration.operations)
    assert {historical_note._meta.db_table, historical_receipt._meta.db_table} <= set(
        connection.introspection.table_names()
    )
    assert table_columns(historical_note._meta.db_table) == {
        "id",
        "owner_id",
        "category",
        "title",
        "content",
        "revision",
        "created_at",
        "last_edited_at",
    }
    assert table_columns(historical_receipt._meta.db_table) == {
        "id",
        "owner_id",
        "key",
        "category",
        "note_id",
        "created_at",
    }

    note_constraints = table_constraints(historical_note._meta.db_table)
    receipt_constraints = table_constraints(historical_receipt._meta.db_table)
    assert note_constraints["note_category_valid"]["check"] is True
    assert note_constraints["note_content_length_lte_max"]["check"] is True
    assert note_constraints["note_owner_edited_idx"]["index"] is True
    assert note_constraints["note_owner_cat_edited_idx"]["index"] is True
    assert receipt_constraints["note_creation_request_category_valid"]["check"] is True
    assert receipt_constraints["note_creation_request_owner_key_unique"]["unique"] is True


def test_fresh_schema_defaults_and_database_invariants():
    user = User.objects.create_user(
        email="fresh-schema@example.com",
        password="Correct-Horse-Battery-Fixture!",
    )
    note = Note.objects.create(owner=user)
    idempotency_key = uuid.uuid4()
    receipt = NoteCreationRequest.objects.create(
        owner=user,
        key=idempotency_key,
        category="drama",
        note_id=note.id,
    )

    assert note.category == "random-thoughts"
    assert note.title == ""
    assert note.content == ""
    assert note.revision == 0
    assert receipt.category == "drama"

    with pytest.raises(IntegrityError), transaction.atomic():
        Note.objects.create(owner=user, category="unknown-category")
    with pytest.raises(IntegrityError), transaction.atomic():
        Note.objects.create(owner=user, content="x" * (NOTE_CONTENT_MAX_LENGTH + 1))
    with pytest.raises(IntegrityError), transaction.atomic():
        NoteCreationRequest.objects.create(
            owner=user,
            key=uuid.uuid4(),
            category="unknown-category",
            note_id=uuid.uuid4(),
        )
    with pytest.raises(IntegrityError), transaction.atomic():
        NoteCreationRequest.objects.create(
            owner=user,
            key=idempotency_key,
            category="drama",
            note_id=uuid.uuid4(),
        )
