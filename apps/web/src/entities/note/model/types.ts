import type { CategoryDefinition, CategoryKey } from "./categories";

export interface NoteListItem {
  id: string;
  title: string;
  contentPreview: string;
  category: CategoryDefinition;
  lastEditedAt: string;
}

export interface NoteDetail {
  id: string;
  title: string;
  content: string;
  category: CategoryDefinition;
  revision: number;
  lastEditedAt: string;
}

export interface PaginatedPage<T> {
  next: string | null;
  results: T[];
}

export interface NotePatch {
  title?: string;
  content?: string;
  categoryKey?: CategoryKey;
}
