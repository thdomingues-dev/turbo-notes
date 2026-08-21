import { adaptCategories, adaptNoteDetail, adaptNoteListPage } from "./adapter";
import type {
  CategoryFilterKey,
  CategoryKey,
  CategoryWithCount,
} from "../model/categories";
import type {
  PaginatedPage,
  NoteDetail,
  NoteListItem,
  NotePatch,
} from "../model/types";
import { apiClient, csrfHeader, unwrapApiResponse } from "@/shared/api/client";
import type { components, operations } from "@/shared/api/generated/schema";

type ApiNoteCreateRequest = components["schemas"]["NoteCreateRequest"];
type ApiNotePatchRequest = NonNullable<
  operations["notes_partial_update"]["requestBody"]
>["content"]["application/json"];

interface GetNotesOptions {
  category: CategoryFilterKey;
  pageUrl?: string;
  signal?: AbortSignal;
}

interface UpdateNoteInput extends NotePatch {
  revision: number;
}

function cursorValue(pageUrl: string): string {
  const values = new URL(pageUrl, "http://local.invalid").searchParams.getAll(
    "cursor",
  );
  if (values.length !== 1 || !values[0]) {
    throw new TypeError("Expected the next-page URL to contain one cursor.");
  }
  return values[0];
}

export async function getCategories(
  signal?: AbortSignal,
): Promise<CategoryWithCount[]> {
  const response = unwrapApiResponse(
    await apiClient.GET("/api/v1/categories/", signal ? { signal } : {}),
  );
  return adaptCategories(response);
}

export async function getNotes({
  category,
  pageUrl,
  signal,
}: GetNotesOptions): Promise<PaginatedPage<NoteListItem>> {
  const query = {
    ...(category === "all" ? {} : { category }),
    ...(pageUrl ? { cursor: cursorValue(pageUrl) } : {}),
  };
  const response = unwrapApiResponse(
    await apiClient.GET("/api/v1/notes/", {
      params: { query },
      ...(signal ? { signal } : {}),
    }),
  );
  return adaptNoteListPage(response);
}

export async function getNote(
  id: string,
  signal?: AbortSignal,
): Promise<NoteDetail> {
  const response = unwrapApiResponse(
    await apiClient.GET("/api/v1/notes/{id}/", {
      params: { path: { id } },
      ...(signal ? { signal } : {}),
    }),
  );
  return adaptNoteDetail(response);
}

export async function createNote(
  categoryKey: CategoryKey,
  idempotencyKey: string,
): Promise<NoteDetail> {
  const body: ApiNoteCreateRequest = {
    category_key: categoryKey,
  };
  const response = unwrapApiResponse(
    await apiClient.POST("/api/v1/notes/", {
      params: {
        header: {
          ...(await csrfHeader()),
          "Idempotency-Key": idempotencyKey,
        },
      },
      body,
    }),
  );
  return adaptNoteDetail(response);
}

export async function updateNote(
  id: string,
  input: UpdateNoteInput,
): Promise<NoteDetail> {
  const body: ApiNotePatchRequest = {
    revision: input.revision,
  };
  if (input.title !== undefined) body.title = input.title;
  if (input.content !== undefined) body.content = input.content;
  if (input.categoryKey !== undefined) body.category_key = input.categoryKey;

  const response = unwrapApiResponse(
    await apiClient.PATCH("/api/v1/notes/{id}/", {
      params: { path: { id }, header: await csrfHeader() },
      body,
    }),
  );
  return adaptNoteDetail(response);
}

export async function deleteNote(id: string): Promise<void> {
  unwrapApiResponse(
    await apiClient.DELETE("/api/v1/notes/{id}/", {
      params: { path: { id }, header: await csrfHeader() },
    }),
  );
}
