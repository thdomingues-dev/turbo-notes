import { QueryClient } from "@tanstack/react-query";

import type { AuthenticatedSession } from "@/features/auth/model/types";
import { CATEGORY_DEFINITIONS } from "@/entities/note/model/categories";
import type { NoteDetail, NoteListItem } from "@/entities/note/model/types";

export const TEST_OWNER_ID = "00000000-0000-4000-8000-000000000099";
export const TEST_TIMESTAMP = "2004-08-17T12:00:00Z";

export const TEST_AUTHENTICATED_SESSION: AuthenticatedSession = {
  authenticated: true,
  user: { id: TEST_OWNER_ID, email: "owner@example.com" },
};

export function createNoteDetail(
  overrides: Partial<NoteDetail> = {},
): NoteDetail {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Original title",
    content: "Original body",
    category: CATEGORY_DEFINITIONS.school,
    revision: 1,
    lastEditedAt: TEST_TIMESTAMP,
    ...overrides,
  };
}

export function createNoteListItem(
  overrides: Partial<NoteListItem> = {},
): NoteListItem {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Original title",
    contentPreview: "Original body",
    category: CATEGORY_DEFINITIONS.school,
    lastEditedAt: TEST_TIMESTAMP,
    ...overrides,
  };
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
