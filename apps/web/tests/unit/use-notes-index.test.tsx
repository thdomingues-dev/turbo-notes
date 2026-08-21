import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CATEGORY_DEFINITIONS } from "@/entities/note/model/categories";
import type { CategoryFilterKey } from "@/entities/note/model/categories";
import type { NoteListItem, PaginatedPage } from "@/entities/note/model/types";
import { useNotesIndex } from "@/app/notes/_model/useNotesIndex";
import { createTestQueryClient } from "./helpers";

const mocks = vi.hoisted(() => ({
  getCategories: vi.fn(),
  getNotes: vi.fn(),
}));
const ownerId = "00000000-0000-4000-8000-000000000099";

vi.mock("@/entities/note/api/notes", () => ({
  getCategories: mocks.getCategories,
  getNotes: mocks.getNotes,
}));

const categories = Object.values(CATEGORY_DEFINITIONS).map(
  (category, index) => ({
    ...category,
    position: index,
    noteCount: 0,
  }),
);

function note(id: string): NoteListItem {
  return {
    id,
    title: `Note ${id}`,
    contentPreview: "Body",
    category: CATEGORY_DEFINITIONS.school,
    lastEditedAt: "2004-08-17T12:00:00Z",
  };
}

function page(
  results: NoteListItem[],
  next: string | null = null,
): PaginatedPage<NoteListItem> {
  return { next, results };
}

function createWrapper() {
  const queryClient = createTestQueryClient();

  const Wrapper = ({ children }: { children: ReactNode }) => {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

  return Wrapper;
}

describe("useNotesIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCategories.mockResolvedValue(categories);
  });

  it("caches categories while giving each filter its own notes query", async () => {
    mocks.getNotes.mockResolvedValue(page([]));
    const { result, rerender } = renderHook(
      ({ category }: { category: CategoryFilterKey }) =>
        useNotesIndex(category, ownerId),
      {
        initialProps: { category: "all" },
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => expect(result.current.status).toBe("success"));
    rerender({ category: "school" });
    await waitFor(() => expect(mocks.getNotes).toHaveBeenCalledTimes(2));

    expect(mocks.getCategories).toHaveBeenCalledTimes(1);
    expect(
      mocks.getNotes.mock.calls.map(([options]) => options.category),
    ).toEqual(["all", "school"]);
  });

  it("loads cursor pages and removes repeated notes at page boundaries", async () => {
    mocks.getNotes
      .mockResolvedValueOnce(
        page([note("1")], "http://api.test/api/v1/notes/?cursor=next-page"),
      )
      .mockResolvedValueOnce(page([note("1"), note("2")]));
    const { result } = renderHook(() => useNotesIndex("all", ownerId), {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(result.current.notes.map(({ id }) => id)).toEqual(["1"]),
    );
    await act(async () => {
      await result.current.loadMore();
    });

    await waitFor(() =>
      expect(result.current.notes.map(({ id }) => id)).toEqual(["1", "2"]),
    );
    expect(result.current.next).toBeNull();
    expect(mocks.getNotes).toHaveBeenLastCalledWith(
      expect.objectContaining({
        category: "all",
        pageUrl: "http://api.test/api/v1/notes/?cursor=next-page",
      }),
    );
  });

  it("never reuses a fresh private cache entry for another owner", async () => {
    mocks.getNotes.mockResolvedValue(page([]));
    const { rerender } = renderHook(
      ({ currentOwnerId }: { currentOwnerId: string }) =>
        useNotesIndex("all", currentOwnerId),
      {
        initialProps: { currentOwnerId: ownerId },
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => expect(mocks.getNotes).toHaveBeenCalledTimes(1));
    rerender({ currentOwnerId: "00000000-0000-4000-8000-000000000100" });

    await waitFor(() => expect(mocks.getNotes).toHaveBeenCalledTimes(2));
    expect(mocks.getCategories).toHaveBeenCalledTimes(2);
  });
});
