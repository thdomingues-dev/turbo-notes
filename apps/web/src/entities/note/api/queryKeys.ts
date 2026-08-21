import type { CategoryFilterKey } from "../model/categories";

export const noteKeys = {
  categories: (ownerId: string | null) =>
    ["notes", "owner", ownerId, "categories"] as const,
  lists: (ownerId: string | null) =>
    ["notes", "owner", ownerId, "list"] as const,
  list: (ownerId: string | null, category: CategoryFilterKey) =>
    ["notes", "owner", ownerId, "list", category] as const,
  detail: (ownerId: string | null, noteId: string) =>
    ["notes", "owner", ownerId, "detail", noteId] as const,
};
