from django.urls import path

from notes.views import CategoryListView, NoteDetailView, NoteListCreateView

app_name = "notes"

urlpatterns = [
    path("categories/", CategoryListView.as_view(), name="category-list"),
    path("notes/", NoteListCreateView.as_view(), name="note-list"),
    path("notes/<uuid:pk>/", NoteDetailView.as_view(), name="note-detail"),
]
