import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NoteEditorScreen } from "@/app/notes/[noteId]/_ui/NoteEditorScreen";
import { getNote } from "@/entities/note/api/notes";
import { getSession } from "@/features/auth/api/auth";
import { ApiError } from "@/shared/api/client";
import {
  createNoteDetail,
  createTestQueryClient,
  deferred,
  TEST_AUTHENTICATED_SESSION,
} from "./helpers";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

vi.mock("@/features/auth/api/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/entities/note/api/notes", () => ({
  getNote: vi.fn(),
  updateNote: vi.fn(),
}));

const note = createNoteDetail();

function renderEditor(withInitialSession = false) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <NoteEditorScreen
        noteId={note.id}
        returnCategory="all"
        {...(withInitialSession
          ? { initialSession: TEST_AUTHENTICATED_SESSION }
          : {})}
      />
    </QueryClientProvider>,
  );
}

describe("NoteEditorScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(getSession).mockResolvedValue(TEST_AUTHENTICATED_SESSION);
  });

  it("surfaces a failed session check before the disabled note query", async () => {
    const user = userEvent.setup();
    vi.mocked(getSession)
      .mockRejectedValueOnce(new Error("Session service unavailable."))
      .mockResolvedValueOnce(TEST_AUTHENTICATED_SESSION);
    vi.mocked(getNote).mockResolvedValue(note);
    renderEditor();

    expect(
      await screen.findByRole("heading", {
        name: "We couldn’t verify your session.",
      }),
    ).toBeVisible();
    expect(getNote).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Note title")).toHaveValue(note.title);
  });

  it("renders a terminal not-found state for a missing note", async () => {
    vi.mocked(getNote).mockRejectedValueOnce(
      new ApiError(404, "No note matches this query."),
    );
    renderEditor(true);

    expect(
      await screen.findByRole("heading", { name: "That note wandered off." }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Return to your notes" }),
    ).toHaveAttribute("href", "/notes");
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
  });

  it("keeps an edited note mounted when session revalidation fails", async () => {
    const user = userEvent.setup();
    const sessionRefresh = deferred<typeof TEST_AUTHENTICATED_SESSION>();
    vi.mocked(getSession).mockReturnValueOnce(sessionRefresh.promise);
    vi.mocked(getNote).mockResolvedValue(note);
    renderEditor(true);

    const title = await screen.findByLabelText("Note title");
    fireEvent.change(title, { target: { value: "Unsaved local title" } });

    await act(async () => {
      sessionRefresh.reject(new Error("Session service unavailable."));
      await sessionRefresh.promise.catch(() => undefined);
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t refresh your session. You can keep working here.",
    );
    expect(title).toHaveValue("Unsaved local title");
    expect(
      screen.queryByRole("heading", {
        name: "We couldn’t verify your session.",
      }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry session" }));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
    expect(title).toHaveValue("Unsaved local title");
  });
});
