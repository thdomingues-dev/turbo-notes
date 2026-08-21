import {
  type InfiniteData,
  type QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authKeys } from "@/features/auth/api/queryKeys";
import { noteKeys } from "@/entities/note/api/queryKeys";
import { CATEGORY_DEFINITIONS } from "@/entities/note/model/categories";
import type {
  CategoryFilterKey,
  CategoryWithCount,
  NoteListItem,
  PaginatedPage,
} from "@/entities/note";
import { writeRecoverableDraft } from "@/features/note-autosave/model/recoverableDraft";
import { NotesScreen } from "@/app/notes/_ui/NotesScreen";
import { ApiError } from "@/shared/api/client";
import {
  createNoteDetail,
  createNoteListItem,
  createTestQueryClient,
  deferred,
  TEST_AUTHENTICATED_SESSION,
  TEST_OWNER_ID,
} from "./helpers";

const mocks = vi.hoisted(() => ({
  deleteNote: vi.fn(),
  getSession: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/entities/note/api/notes", () => ({
  createNote: vi.fn(),
  deleteNote: mocks.deleteNote,
}));

vi.mock("@/features/auth/api/auth", () => ({
  getSession: mocks.getSession,
  logOut: vi.fn(),
}));

const ownerId = TEST_OWNER_ID;
const listedNote = createNoteListItem({
  title: "QA checklist",
  contentPreview: "Delete flow",
});
const detailedNote = createNoteDetail({
  id: listedNote.id,
  title: listedNote.title,
  content: listedNote.contentPreview,
  category: listedNote.category,
  lastEditedAt: listedNote.lastEditedAt,
});
const survivingNote = createNoteListItem({
  id: "00000000-0000-4000-8000-000000000002",
  title: "Keep this note",
  category: CATEGORY_DEFINITIONS.personal,
});
const authenticatedSession = TEST_AUTHENTICATED_SESSION;

type NotesInfiniteData = InfiniteData<
  PaginatedPage<NoteListItem>,
  string | null
>;

function infiniteNotes(...notes: NoteListItem[]): NotesInfiniteData {
  return {
    pages: [{ next: null, results: notes }],
    pageParams: [null],
  };
}

function cachedNoteIds(
  queryClient: QueryClient,
  category: CategoryFilterKey,
): string[] {
  const data = queryClient.getQueryData<NotesInfiniteData>(
    noteKeys.list(ownerId, category),
  );
  return (
    data?.pages.flatMap((page) => page.results.map((note) => note.id)) ?? []
  );
}

function cachedCategoryCount(
  queryClient: QueryClient,
  category: CategoryFilterKey,
): number | null | undefined {
  return queryClient
    .getQueryData<CategoryWithCount[]>(noteKeys.categories(ownerId))
    ?.find((candidate) => candidate.key === category)?.noteCount;
}

vi.mock("@/app/notes/_model/useNotesIndex", () => ({
  useNotesIndex: () => ({
    status: "success",
    categories: Object.values(CATEGORY_DEFINITIONS).map((category) => ({
      ...category,
      noteCount: category.key === "school" ? 1 : 0,
    })),
    notes: [listedNote],
    next: null,
    error: null,
    categoriesError: null,
    isLoadingMore: false,
    loadMoreError: null,
    retry: vi.fn(),
    retryCategories: vi.fn(),
    loadMore: vi.fn(),
  }),
}));

function renderNotesScreen() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(authKeys.session, authenticatedSession);
  queryClient.setQueryData(
    noteKeys.list(ownerId, "all"),
    infiniteNotes(listedNote, survivingNote),
  );
  queryClient.setQueryData(
    noteKeys.list(ownerId, "school"),
    infiniteNotes(listedNote),
  );
  queryClient.setQueryData(
    noteKeys.list(ownerId, "personal"),
    infiniteNotes(survivingNote),
  );
  queryClient.setQueryData(
    noteKeys.categories(ownerId),
    Object.values(CATEGORY_DEFINITIONS).map((category) => ({
      ...category,
      noteCount:
        category.key === "school" || category.key === "personal" ? 1 : 0,
    })),
  );
  queryClient.setQueryData(
    noteKeys.detail(ownerId, listedNote.id),
    detailedNote,
  );
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <NotesScreen />
    </QueryClientProvider>,
  );
  return { queryClient, invalidateQueries };
}

describe("notes delete flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.getSession.mockResolvedValue(authenticatedSession);
  });

  it("resolves the dialog from local reconciliation without waiting for invalidation", async () => {
    const user = userEvent.setup();
    const deletion = deferred<void>();
    const invalidation = deferred<void>();
    mocks.deleteNote.mockReturnValue(deletion.promise);
    writeRecoverableDraft(ownerId, listedNote.id, detailedNote, 1);
    const { queryClient, invalidateQueries } = renderNotesScreen();
    invalidateQueries.mockReturnValue(invalidation.promise);
    const deleteAction = screen.getByRole("button", {
      name: "Delete QA checklist",
    });

    await user.click(deleteAction);
    expect(screen.getByRole("dialog", { name: "Delete note?" })).toBeVisible();
    expect(screen.getByText(/“QA checklist”/)).toBeVisible();
    expect(mocks.deleteNote).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteAction).toHaveFocus();

    await user.click(deleteAction);
    await user.click(screen.getByRole("button", { name: "Delete note" }));
    expect(mocks.deleteNote).toHaveBeenCalledWith(listedNote.id);
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();

    deletion.resolve();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "New Note" })[0],
      ).toHaveFocus(),
    );

    expect(
      queryClient.getQueryData(noteKeys.detail(ownerId, listedNote.id)),
    ).toBeUndefined();
    expect(cachedNoteIds(queryClient, "all")).toEqual([survivingNote.id]);
    expect(cachedNoteIds(queryClient, "school")).toEqual([]);
    expect(cachedNoteIds(queryClient, "personal")).toEqual([survivingNote.id]);
    expect(cachedCategoryCount(queryClient, "school")).toBe(0);
    expect(cachedCategoryCount(queryClient, "personal")).toBe(1);
    expect(window.localStorage).toHaveLength(0);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: noteKeys.lists(ownerId),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: noteKeys.categories(ownerId),
    });

    let invalidationFinished = false;
    void invalidation.promise.then(() => {
      invalidationFinished = true;
    });
    expect(invalidationFinished).toBe(false);
    invalidation.resolve();
    await invalidation.promise;
  });

  it("treats a missing server note as successful local cleanup", async () => {
    const user = userEvent.setup();
    mocks.deleteNote.mockRejectedValue(
      new ApiError(404, "No note matches this query."),
    );
    writeRecoverableDraft(ownerId, listedNote.id, detailedNote, 1);
    const { queryClient, invalidateQueries } = renderNotesScreen();

    await user.click(
      screen.getByRole("button", { name: "Delete QA checklist" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete note" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      queryClient.getQueryData(noteKeys.detail(ownerId, listedNote.id)),
    ).toBeUndefined();
    expect(cachedNoteIds(queryClient, "all")).toEqual([survivingNote.id]);
    expect(cachedNoteIds(queryClient, "school")).toEqual([]);
    expect(cachedCategoryCount(queryClient, "school")).toBe(0);
    expect(window.localStorage).toHaveLength(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: noteKeys.lists(ownerId),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: noteKeys.categories(ownerId),
    });
  });

  it("keeps the confirmation open with a retryable error", async () => {
    const user = userEvent.setup();
    mocks.deleteNote.mockRejectedValue(
      new Error("The note could not be deleted."),
    );
    renderNotesScreen();

    await user.click(
      screen.getByRole("button", { name: "Delete QA checklist" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete note" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The note could not be deleted.",
    );
    expect(screen.getByRole("dialog", { name: "Delete note?" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete note" })).toBeEnabled();
  });
});
