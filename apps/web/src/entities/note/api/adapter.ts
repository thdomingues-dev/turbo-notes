import { CATEGORY_DEFINITIONS } from "../model/categories";
import type {
  CategoryDefinition,
  CategoryKey,
  CategoryWithCount,
} from "../model/categories";
import type { PaginatedPage, NoteDetail, NoteListItem } from "../model/types";
import type { components } from "@/shared/api/generated/schema";

type ApiCategory = components["schemas"]["Category"];
type ApiNoteDetail = components["schemas"]["NoteDetail"];
type ApiNoteListPage = components["schemas"]["PaginatedNoteListList"];

function categoryDefinition(key: CategoryKey): CategoryDefinition {
  return CATEGORY_DEFINITIONS[key];
}

export function adaptCategories(response: ApiCategory[]): CategoryWithCount[] {
  const counts = new Map(
    response.map((category) => [category.key, category.note_count]),
  );

  return Object.values(CATEGORY_DEFINITIONS).map((category) => ({
    ...category,
    noteCount: counts.get(category.key) ?? null,
  }));
}

export function adaptNoteListPage(
  response: ApiNoteListPage,
): PaginatedPage<NoteListItem> {
  return {
    next: response.next ?? null,
    results: response.results.map((item) => ({
      id: item.id,
      title: item.title,
      contentPreview: item.content_preview,
      category: categoryDefinition(item.category_key),
      lastEditedAt: item.last_edited_at,
    })),
  };
}

export function adaptNoteDetail(response: ApiNoteDetail): NoteDetail {
  return {
    id: response.id,
    title: response.title,
    content: response.content,
    category: categoryDefinition(response.category_key),
    revision: response.revision,
    lastEditedAt: response.last_edited_at,
  };
}
