import uuid

from django.conf import settings
from django.core.validators import MaxLengthValidator
from django.db import models
from django.db.models.functions import Length
from django.db.models.lookups import LessThanOrEqual
from django.utils import timezone

from notes.constants import NOTE_CONTENT_MAX_LENGTH, NOTE_TITLE_MAX_LENGTH


class CategoryKey(models.TextChoices):
    RANDOM_THOUGHTS = "random-thoughts", "Random Thoughts"
    SCHOOL = "school", "School"
    PERSONAL = "personal", "Personal"
    DRAMA = "drama", "Drama"


class Note(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notes",
    )
    category = models.CharField(
        max_length=32,
        choices=CategoryKey,
        default=CategoryKey.RANDOM_THOUGHTS,
    )
    title = models.CharField(max_length=NOTE_TITLE_MAX_LENGTH, blank=True, default="")
    content = models.TextField(
        blank=True,
        default="",
        validators=[MaxLengthValidator(NOTE_CONTENT_MAX_LENGTH)],
    )
    revision = models.PositiveBigIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    last_edited_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("-last_edited_at", "-id")
        indexes = [
            models.Index(
                fields=("owner", "-last_edited_at", "-id"),
                name="note_owner_edited_idx",
            ),
            models.Index(
                fields=("owner", "category", "-last_edited_at", "-id"),
                name="note_owner_cat_edited_idx",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(category__in=CategoryKey.values),
                name="note_category_valid",
            ),
            models.CheckConstraint(
                condition=LessThanOrEqual(Length("content"), NOTE_CONTENT_MAX_LENGTH),
                name="note_content_length_lte_max",
            ),
        ]

    def __str__(self) -> str:
        return self.title or "Untitled note"


class NoteCreationRequest(models.Model):
    """Durable receipt used to make note creation idempotent."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="note_creation_requests",
    )
    key = models.UUIDField(editable=False)
    category = models.CharField(max_length=32, choices=CategoryKey, editable=False)
    note_id = models.UUIDField(editable=False)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(category__in=CategoryKey.values),
                name="note_creation_request_category_valid",
            ),
            models.UniqueConstraint(
                fields=("owner", "key"),
                name="note_creation_request_owner_key_unique",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.owner_id}:{self.key}"
