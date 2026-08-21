from rest_framework import serializers

from config.openapi import ErrorSerializer
from config.serializers import StrictSerializer
from notes.constants import NOTE_CONTENT_MAX_LENGTH, NOTE_TITLE_MAX_LENGTH
from notes.models import CategoryKey, Note


class CategorySerializer(serializers.Serializer):
    key = serializers.ChoiceField(choices=CategoryKey.choices, read_only=True)
    note_count = serializers.IntegerField(read_only=True)


class NoteListSerializer(serializers.ModelSerializer):
    category_key = serializers.ChoiceField(
        choices=CategoryKey.choices,
        source="category",
        read_only=True,
    )
    content_preview = serializers.CharField(read_only=True)

    class Meta:
        model = Note
        fields = ("id", "title", "content_preview", "category_key", "last_edited_at")
        read_only_fields = fields


class NoteDetailSerializer(serializers.ModelSerializer):
    category_key = serializers.ChoiceField(
        choices=CategoryKey.choices,
        source="category",
        read_only=True,
    )

    class Meta:
        model = Note
        fields = (
            "id",
            "category_key",
            "title",
            "content",
            "revision",
            "created_at",
            "last_edited_at",
        )
        read_only_fields = fields


class NoteCreationSnapshotSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    category_key = serializers.ChoiceField(choices=CategoryKey.choices, read_only=True)
    title = serializers.CharField(read_only=True)
    content = serializers.CharField(read_only=True)
    revision = serializers.IntegerField(min_value=0, read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    last_edited_at = serializers.DateTimeField(read_only=True)


class NoteCreateSerializer(StrictSerializer):
    category_key = serializers.ChoiceField(
        choices=CategoryKey.choices,
        source="category",
        required=False,
        help_text=f"Defaults to `{CategoryKey.RANDOM_THOUGHTS}` when omitted.",
        error_messages={"invalid_choice": "Invalid category."},
    )


class NoteCreateHeadersSerializer(serializers.Serializer):
    idempotency_key = serializers.UUIDField(required=False)


class NoteListQuerySerializer(StrictSerializer):
    category = serializers.ChoiceField(
        choices=CategoryKey.choices,
        required=False,
        error_messages={"invalid_choice": "Invalid category."},
    )
    cursor = serializers.CharField(
        required=False,
        allow_blank=False,
        max_length=1024,
        trim_whitespace=False,
        help_text="Opaque pagination cursor from a previous page link.",
    )

    def to_internal_value(self, data):
        if hasattr(data, "getlist"):
            repeated = [field for field in self.fields if len(data.getlist(field)) > 1]
            if repeated:
                raise serializers.ValidationError(
                    {field: ["Provide this query parameter once."] for field in repeated}
                )
            if "cursor" in data and data.get("cursor") == "":
                raise serializers.ValidationError({"cursor": ["This field may not be blank."]})
        return super().to_internal_value(data)


class NotePatchSerializer(StrictSerializer):
    revision = serializers.IntegerField(required=True, min_value=0, write_only=True)
    category_key = serializers.ChoiceField(
        choices=CategoryKey.choices,
        source="category",
        required=False,
        error_messages={"invalid_choice": "Invalid category."},
    )
    title = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=NOTE_TITLE_MAX_LENGTH,
    )
    content = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=NOTE_CONTENT_MAX_LENGTH,
        trim_whitespace=False,
    )

    def validate(self, attrs):
        if not any(field in attrs for field in ("category", "title", "content")):
            raise serializers.ValidationError("At least one editable field is required.")
        return attrs


class RevisionConflictCurrentSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    revision = serializers.IntegerField(min_value=0, read_only=True)
    last_edited_at = serializers.DateTimeField(read_only=True)


class RevisionConflictErrorSerializer(ErrorSerializer):
    code = serializers.ChoiceField(choices=("revision_conflict",), read_only=True)
    current = RevisionConflictCurrentSerializer(read_only=True)
