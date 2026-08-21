import type { Route } from "next";

import type { CategoryFilterKey } from "../model/categories";

export const RETURN_CATEGORY_PARAM = "returnCategory";

export function notesPath(category: CategoryFilterKey): Route {
  return (
    category === "all"
      ? "/notes"
      : `/notes?category=${encodeURIComponent(category)}`
  ) as Route;
}

export function noteEditorPath(
  noteId: string,
  returnCategory: CategoryFilterKey,
): Route {
  const path = `/notes/${encodeURIComponent(noteId)}`;
  return (
    returnCategory === "all"
      ? path
      : `${path}?${RETURN_CATEGORY_PARAM}=${encodeURIComponent(returnCategory)}`
  ) as Route;
}
