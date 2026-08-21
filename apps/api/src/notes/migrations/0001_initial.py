# Generated for Django 5.2.

import uuid

import django.core.validators
import django.db.models.deletion
import django.db.models.functions.text
import django.db.models.lookups
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Note",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("random-thoughts", "Random Thoughts"),
                            ("school", "School"),
                            ("personal", "Personal"),
                            ("drama", "Drama"),
                        ],
                        default="random-thoughts",
                        max_length=32,
                    ),
                ),
                ("title", models.CharField(blank=True, default="", max_length=200)),
                (
                    "content",
                    models.TextField(
                        blank=True,
                        default="",
                        validators=[django.core.validators.MaxLengthValidator(100_000)],
                    ),
                ),
                ("revision", models.PositiveBigIntegerField(default=0)),
                (
                    "created_at",
                    models.DateTimeField(default=django.utils.timezone.now, editable=False),
                ),
                ("last_edited_at", models.DateTimeField(default=django.utils.timezone.now)),
                (
                    "owner",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="notes",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ("-last_edited_at", "-id"),
                "indexes": [
                    models.Index(
                        fields=["owner", "-last_edited_at", "-id"],
                        name="note_owner_edited_idx",
                    ),
                    models.Index(
                        fields=["owner", "category", "-last_edited_at", "-id"],
                        name="note_owner_cat_edited_idx",
                    ),
                ],
                "constraints": [
                    models.CheckConstraint(
                        condition=models.Q(
                            ("category__in", ["random-thoughts", "school", "personal", "drama"])
                        ),
                        name="note_category_valid",
                    ),
                    models.CheckConstraint(
                        condition=django.db.models.lookups.LessThanOrEqual(
                            django.db.models.functions.text.Length("content"),
                            100_000,
                        ),
                        name="note_content_length_lte_max",
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name="NoteCreationRequest",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("key", models.UUIDField(editable=False)),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("random-thoughts", "Random Thoughts"),
                            ("school", "School"),
                            ("personal", "Personal"),
                            ("drama", "Drama"),
                        ],
                        editable=False,
                        max_length=32,
                    ),
                ),
                ("note_id", models.UUIDField(editable=False)),
                (
                    "created_at",
                    models.DateTimeField(default=django.utils.timezone.now, editable=False),
                ),
                (
                    "owner",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="note_creation_requests",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "constraints": [
                    models.CheckConstraint(
                        condition=models.Q(
                            ("category__in", ["random-thoughts", "school", "personal", "drama"])
                        ),
                        name="note_creation_request_category_valid",
                    ),
                    models.UniqueConstraint(
                        fields=("owner", "key"),
                        name="note_creation_request_owner_key_unique",
                    ),
                ],
            },
        ),
    ]
