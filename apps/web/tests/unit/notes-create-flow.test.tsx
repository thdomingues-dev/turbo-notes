import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authKeys } from "@/features/auth/api/queryKeys";
import { useCreateNote } from "@/app/notes/_model/useCreateNote";
import { NotesScreen } from "@/app/notes/_ui/NotesScreen";
import { CATEGORY_DEFINITIONS } from "@/entities/note/model/categories";
import { writeRecoverableDraft } from "@/features/note-autosave/model/recoverableDraft";
import { noteKeys } from "@/entities/note/api/queryKeys";
import { ApiError } from "@/shared/api/client";
import {
  createNoteDetail,
  createTestQueryClient,
  deferred,
  TEST_AUTHENTICATED_SESSION,
  TEST_OWNER_ID,
} from "./helpers";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  createNote: vi.fn(),
  logOut: vi.fn(),
  getSession: vi.fn(),
  search: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock("@/entities/note/api/notes", () => ({
  createNote: mocks.createNote,
}));

vi.mock("@/features/auth/api/auth", () => ({
  getSession: mocks.getSession,
  logOut: mocks.logOut,
}));

vi.mock("@/app/notes/_model/useNotesIndex", () => ({
  useNotesIndex: () => ({
    status: "success",
    categories: Object.values(CATEGORY_DEFINITIONS).map((category) => ({
      ...category,
      noteCount: 0,
    })),
    notes: [],
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

const createdNote = createNoteDetail({
  id: "server-note-1",
  title: "",
  content: "",
  category: CATEGORY_DEFINITIONS["random-thoughts"],
});
const ownerId = TEST_OWNER_ID;
const authenticatedSession = TEST_AUTHENTICATED_SESSION;

function renderNotesScreen() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(authKeys.session, authenticatedSession);
  const view = render(
    <QueryClientProvider client={queryClient}>
      <NotesScreen />
    </QueryClientProvider>,
  );
  return {
    ...view,
    queryClient,
    rerenderNotesScreen() {
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <NotesScreen />
        </QueryClientProvider>,
      );
    },
  };
}

function createHookWrapper() {
  const queryClient = createTestQueryClient();
  const HookWrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  HookWrapper.displayName = "CreateNoteHookWrapper";
  return HookWrapper;
}

describe("notes screen flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.search = "";
    mocks.getSession.mockResolvedValue(authenticatedSession);
    mocks.logOut.mockResolvedValue(undefined);
  });

  it("waits for the POST and ignores double activation before navigation", async () => {
    const user = userEvent.setup();
    const creation = deferred<typeof createdNote>();
    mocks.createNote.mockReturnValue(creation.promise);
    renderNotesScreen();

    const newNoteButton = screen.getAllByRole("button", {
      name: "New Note",
    })[0]!;
    await user.click(newNoteButton);
    await user.click(newNoteButton);

    expect(mocks.createNote).toHaveBeenCalledTimes(1);
    expect(mocks.createNote).toHaveBeenCalledWith(
      "random-thoughts",
      expect.any(String),
    );
    expect(mocks.push).not.toHaveBeenCalled();

    creation.resolve(createdNote);
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/notes/server-note-1"),
    );
  });

  it("retries a failed creation with the same category and idempotency key", async () => {
    const user = userEvent.setup();
    mocks.createNote
      .mockRejectedValueOnce(new Error("The note could not be created."))
      .mockResolvedValueOnce(createdNote);
    renderNotesScreen();

    await user.click(screen.getAllByRole("button", { name: "New Note" })[0]!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The note could not be created.",
    );
    const newNoteButtons = screen.getAllByRole("button", { name: "New Note" });
    expect(newNoteButtons).toHaveLength(2);
    expect(
      newNoteButtons.every((button) => button.hasAttribute("disabled")),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(mocks.push).not.toHaveBeenCalled();

    await user.click(newNoteButtons[0]!);
    expect(mocks.createNote).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mocks.createNote).toHaveBeenCalledTimes(2));
    const firstIdempotencyKey = mocks.createNote.mock.calls[0]?.[1];
    expect(firstIdempotencyKey).toEqual(expect.any(String));
    expect(mocks.createNote.mock.calls).toEqual([
      ["random-thoughts", firstIdempotencyKey],
      ["random-thoughts", firstIdempotencyKey],
    ]);
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/notes/server-note-1"),
    );
  });

  it("does not replace an unresolved creation when create is called directly", async () => {
    mocks.createNote
      .mockRejectedValueOnce(new Error("The note could not be created."))
      .mockResolvedValueOnce(createdNote);
    const onCreated = vi.fn();
    const { result } = renderHook(
      () =>
        useCreateNote({
          ownerId,
          onCreated,
          onNotAuthenticated: vi.fn(),
        }),
      { wrapper: createHookWrapper() },
    );

    act(() => result.current.create("random-thoughts", "all"));
    await waitFor(() =>
      expect(result.current.error).toBe("The note could not be created."),
    );
    const firstIdempotencyKey = mocks.createNote.mock.calls[0]?.[1];

    act(() => result.current.create("school", "school"));
    expect(mocks.createNote).toHaveBeenCalledTimes(1);
    expect(result.current.hasPendingCreation).toBe(true);
    expect(result.current.pendingCategory).toBe("random-thoughts");

    act(() => result.current.retry());
    await waitFor(() => expect(mocks.createNote).toHaveBeenCalledTimes(2));
    expect(mocks.createNote.mock.calls[1]?.[1]).toBe(firstIdempotencyKey);
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
  });

  it("releases a failed creation only after canceling it", async () => {
    const user = userEvent.setup();
    mocks.createNote
      .mockRejectedValueOnce(new Error("The note could not be created."))
      .mockResolvedValueOnce(createdNote);
    renderNotesScreen();

    await user.click(screen.getAllByRole("button", { name: "New Note" })[0]!);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The note could not be created.",
    );
    const firstIdempotencyKey = mocks.createNote.mock.calls[0]?.[1];

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    const releasedButtons = screen.getAllByRole("button", { name: "New Note" });
    expect(
      releasedButtons.every((button) => !button.hasAttribute("disabled")),
    ).toBe(true);

    await user.click(releasedButtons[0]!);
    await waitFor(() => expect(mocks.createNote).toHaveBeenCalledTimes(2));
    expect(mocks.createNote.mock.calls[1]?.[1]).not.toBe(firstIdempotencyKey);
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/notes/server-note-1"),
    );
  });

  it("keeps the notes screen mounted when session revalidation fails", async () => {
    const user = userEvent.setup();
    const sessionRefresh = deferred<typeof authenticatedSession>();
    mocks.getSession.mockReturnValueOnce(sessionRefresh.promise);
    renderNotesScreen();

    expect(screen.getAllByRole("button", { name: "New Note" })).toHaveLength(2);

    await act(async () => {
      sessionRefresh.reject(new Error("Session service unavailable."));
      await sessionRefresh.promise.catch(() => undefined);
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t refresh your session. You can keep working here.",
    );
    expect(screen.getAllByRole("button", { name: "New Note" })).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Retry session" }));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
  });

  it("still signs out when session revalidation reports an expired session", async () => {
    mocks.getSession.mockRejectedValueOnce(
      new ApiError(403, "Authentication credentials were not provided.", {
        code: "not_authenticated",
        detail: "Authentication credentials were not provided.",
      }),
    );
    renderNotesScreen();

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
    expect(
      screen.queryByText(
        "We couldn’t refresh your session. You can keep working here.",
      ),
    ).not.toBeInTheDocument();
  });

  it("routes an expired session to login without treating CSRF failures as logout", async () => {
    const user = userEvent.setup();
    mocks.createNote.mockRejectedValue(
      new ApiError(403, "Authentication credentials were not provided.", {
        code: "not_authenticated",
        detail: "Authentication credentials were not provided.",
      }),
    );
    renderNotesScreen();

    await user.click(screen.getAllByRole("button", { name: "New Note" })[0]!);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
  });

  it("waits for logout acknowledgement before clearing private client state", async () => {
    const user = userEvent.setup();
    const logout = deferred<void>();
    mocks.logOut.mockReturnValue(logout.promise);
    writeRecoverableDraft(
      ownerId,
      createdNote.id,
      createdNote,
      createdNote.revision,
    );
    const view = renderNotesScreen();
    view.queryClient.setQueryData(noteKeys.list(ownerId, "all"), {
      pages: [{ results: [createdNote] }],
      pageParams: [null],
    });

    const logoutButton = screen.getByRole("button", { name: "Log out" });
    await user.click(logoutButton);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Logging out…" })).toBeDisabled();

    logout.resolve();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
    expect(window.localStorage).toHaveLength(0);
    expect(
      view.queryClient.getQueryData(noteKeys.list(ownerId, "all")),
    ).toBeUndefined();
    expect(window.localStorage).toHaveLength(0);
  });
});
