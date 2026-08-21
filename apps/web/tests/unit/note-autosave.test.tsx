import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getNote, updateNote } from "@/entities/note/api/notes";
import { CATEGORY_DEFINITIONS } from "@/entities/note/model/categories";
import type { NoteDetail } from "@/entities/note/model/types";
import {
  SAVE_DEBOUNCE_MS,
  SAVE_MAX_WAIT_MS,
  useNoteAutosave,
} from "@/features/note-autosave/model/useNoteAutosave";
import {
  clearAllRecoverableDrafts,
  readRecoverableDraft,
  writeRecoverableDraft,
} from "@/features/note-autosave/model/recoverableDraft";
import { ApiError } from "@/shared/api/client";
import { createNoteDetail, deferred, TEST_OWNER_ID } from "./helpers";

vi.mock("@/entities/note/api/notes", () => ({
  getNote: vi.fn(),
  updateNote: vi.fn(),
}));

const ownerId = TEST_OWNER_ID;
const initialNote: NoteDetail = createNoteDetail({
  title: "Original title",
  content: "Original body",
  category: CATEGORY_DEFINITIONS.school,
});

function savedNote(changes: Partial<NoteDetail> = {}): NoteDetail {
  return {
    ...initialNote,
    revision: 2,
    lastEditedAt: "2004-08-17T13:00:00Z",
    ...changes,
  };
}

describe("note autosave state machine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("waits exactly 600 ms, reports unsaved before the request, and uses server time", async () => {
    vi.useFakeTimers();
    vi.mocked(updateNote).mockResolvedValueOnce(
      savedNote({ title: "Changed title" }),
    );
    const { result } = renderHook(() =>
      useNoteAutosave(initialNote.id, ownerId, initialNote),
    );

    act(() => result.current.updateTitle("Changed title"));

    expect(result.current.saveState).toBe("dirty");
    expect(result.current.draft.lastEditedAt).toBe(initialNote.lastEditedAt);
    expect(updateNote).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS - 1));
    expect(updateNote).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(updateNote).toHaveBeenCalledWith(initialNote.id, {
      title: "Changed title",
      revision: 1,
    });
    expect(result.current.saveState).toBe("saved");
    expect(result.current.draft.lastEditedAt).toBe("2004-08-17T13:00:00Z");
  });

  it("does not postpone a continuously edited draft beyond the two-second maximum", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.mocked(updateNote).mockResolvedValueOnce(
      savedNote({ title: "Typing 4" }),
    );
    const { result } = renderHook(() =>
      useNoteAutosave(initialNote.id, ownerId, initialNote),
    );

    act(() => result.current.updateTitle("Typing 1"));
    for (const title of ["Typing 2", "Typing 3", "Typing 4"]) {
      await act(async () => vi.advanceTimersByTimeAsync(500));
      act(() => result.current.updateTitle(title));
    }

    await act(async () => vi.advanceTimersByTimeAsync(499));
    expect(updateNote).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));

    expect(Date.now()).toBe(SAVE_MAX_WAIT_MS);
    expect(updateNote).toHaveBeenCalledTimes(1);
    expect(updateNote).toHaveBeenCalledWith(initialNote.id, {
      title: "Typing 4",
      revision: 1,
    });
  });

  it("keeps one request in flight and sends one immediate trailing snapshot", async () => {
    vi.useFakeTimers();
    const firstRequest = deferred<NoteDetail>();
    const trailingRequest = deferred<NoteDetail>();
    vi.mocked(updateNote)
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(trailingRequest.promise);
    const { result } = renderHook(() =>
      useNoteAutosave(initialNote.id, ownerId, initialNote),
    );

    act(() => result.current.updateTitle("First snapshot"));
    await act(async () => vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS));
    expect(updateNote).toHaveBeenCalledTimes(1);

    act(() => result.current.updateContent("Latest trailing body"));
    await act(async () => vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS));
    expect(updateNote).toHaveBeenCalledTimes(1);
    expect(result.current.saveState).toBe("saving");

    await act(async () => {
      firstRequest.resolve(
        savedNote({
          title: "First snapshot",
          content: initialNote.content,
        }),
      );
      await Promise.resolve();
    });

    expect(updateNote).toHaveBeenCalledTimes(2);
    expect(updateNote).toHaveBeenLastCalledWith(initialNote.id, {
      content: "Latest trailing body",
      revision: 2,
    });

    await act(async () => {
      trailingRequest.resolve(
        savedNote({
          title: "First snapshot",
          content: "Latest trailing body",
          revision: 3,
          lastEditedAt: "2004-08-17T14:00:00Z",
        }),
      );
      await Promise.resolve();
    });

    expect(result.current.saveState).toBe("saved");
    expect(result.current.draft.content).toBe("Latest trailing body");
    expect(result.current.draft.revision).toBe(3);
  });

  it("reconciles a normalized title acknowledgement and terminates the save loop", async () => {
    vi.useFakeTimers();
    vi.mocked(updateNote).mockResolvedValueOnce(
      savedNote({ title: "normalized" }),
    );
    const { result } = renderHook(() =>
      useNoteAutosave(initialNote.id, ownerId, initialNote),
    );

    await act(async () => {
      result.current.updateTitle("  normalized  ");
      await result.current.saveNow();
    });

    expect(updateNote).toHaveBeenCalledTimes(1);
    expect(result.current.draft.title).toBe("normalized");
    expect(result.current.saveState).toBe("saved");
    await act(async () => vi.advanceTimersByTimeAsync(SAVE_MAX_WAIT_MS + 1));
    expect(updateNote).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite a newer edit when a normalized acknowledgement arrives", async () => {
    const request = deferred<NoteDetail>();
    const trailingRequest = deferred<NoteDetail>();
    vi.mocked(updateNote)
      .mockReturnValueOnce(request.promise)
      .mockReturnValueOnce(trailingRequest.promise);
    const { result } = renderHook(() =>
      useNoteAutosave(initialNote.id, ownerId, initialNote),
    );

    let firstSave!: Promise<boolean>;
    act(() => {
      result.current.updateTitle("  first  ");
      firstSave = result.current.saveNow();
    });
    act(() => result.current.updateTitle("newer local title"));

    await act(async () => {
      request.resolve(savedNote({ title: "first" }));
      await Promise.resolve();
    });
    expect(result.current.draft.title).toBe("newer local title");
    expect(updateNote).toHaveBeenLastCalledWith(initialNote.id, {
      title: "newer local title",
      revision: 2,
    });

    await act(async () => {
      trailingRequest.resolve(
        savedNote({ title: "newer local title", revision: 3 }),
      );
      await firstSave;
    });
    expect(result.current.draft.title).toBe("newer local title");
    expect(result.current.saveState).toBe("saved");
  });

  it("persists a failed draft, restores it for the same owner, and clears it after retry", async () => {
    vi.mocked(updateNote).mockRejectedValue(new Error("Offline"));
    const first = renderHook(() =>
      useNoteAutosave(initialNote.id, ownerId, initialNote),
    );

    await act(async () => {
      first.result.current.updateContent("Recover this draft");
      await first.result.current.saveNow();
    });
    expect(first.result.current.saveState).toBe("error");
    expect(readRecoverableDraft(ownerId, initialNote.id)).toEqual(
      expect.objectContaining({
        content: "Recover this draft",
        baseRevision: 1,
      }),
    );

    await act(async () => {
      first.unmount();
      await Promise.resolve();
    });
    const second = renderHook(() =>
      useNoteAutosave(initialNote.id, ownerId, initialNote),
    );
    expect(second.result.current.draft.content).toBe("Recover this draft");
    expect(second.result.current.draft.lastEditedAt).toBe(
      initialNote.lastEditedAt,
    );
    expect(second.result.current.saveState).toBe("error");
    expect(second.result.current.saveError).toContain(
      "Recovered an unsaved draft",
    );

    vi.mocked(updateNote).mockReset();
    vi.mocked(updateNote).mockResolvedValueOnce(
      savedNote({ content: "Recover this draft" }),
    );
    await act(async () => {
      await second.result.current.retry();
    });

    expect(second.result.current.saveState).toBe("saved");
    expect(readRecoverableDraft(ownerId, initialNote.id)).toBeNull();
  });

  it("preserves the draft and reports authentication expiry to the caller", async () => {
    const onNotAuthenticated = vi.fn();
    vi.mocked(updateNote).mockRejectedValueOnce(
      new ApiError(403, "Authentication credentials were not provided.", {
        code: "not_authenticated",
        detail: "Authentication credentials were not provided.",
      }),
    );
    const { result } = renderHook(() =>
      useNoteAutosave(
        initialNote.id,
        ownerId,
        initialNote,
        undefined,
        onNotAuthenticated,
      ),
    );

    let saved = true;
    await act(async () => {
      result.current.updateContent("Keep this after expiry");
      saved = await result.current.saveNow();
    });

    expect(saved).toBe(false);
    expect(onNotAuthenticated).toHaveBeenCalledTimes(1);
    expect(readRecoverableDraft(ownerId, initialNote.id)?.content).toBe(
      "Keep this after expiry",
    );
  });

  it("does not recreate a draft after signed-out cleanup unmounts the editor", () => {
    const view = renderHook(() =>
      useNoteAutosave(initialNote.id, ownerId, initialNote),
    );
    act(() => view.result.current.updateContent("Private signed-out draft"));

    clearAllRecoverableDrafts();
    act(() => view.unmount());

    expect(readRecoverableDraft(ownerId, initialNote.id)).toBeNull();
  });

  it("treats a recovered draft from an older revision as a conflict", async () => {
    writeRecoverableDraft(
      ownerId,
      initialNote.id,
      { ...initialNote, title: "Recovered stale title" },
      0,
    );
    const latest = savedNote({ title: "Server title" });
    vi.mocked(getNote).mockResolvedValueOnce(latest);
    const { result } = renderHook(() =>
      useNoteAutosave(initialNote.id, ownerId, initialNote),
    );

    expect(result.current.saveState).toBe("conflict");
    expect(result.current.draft.title).toBe("Recovered stale title");
    await act(async () => {
      await result.current.retry();
    });
    expect(updateNote).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.reloadLatest();
    });
    expect(result.current.draft).toEqual(latest);
    expect(result.current.saveState).toBe("saved");
    expect(readRecoverableDraft(ownerId, initialNote.id)).toBeNull();
  });

  it("flushes for pagehide and retains an unmounted draft without a Strict Mode request", async () => {
    vi.mocked(updateNote).mockResolvedValue(
      savedNote({ content: "Lifecycle draft" }),
    );
    const first = renderHook(() =>
      useNoteAutosave(initialNote.id, ownerId, initialNote),
    );
    act(() => first.result.current.updateContent("Lifecycle draft"));

    await act(async () => {
      window.dispatchEvent(new PageTransitionEvent("pagehide"));
      await Promise.resolve();
    });
    expect(updateNote).toHaveBeenCalledTimes(1);
    expect(first.result.current.saveState).toBe("saved");

    const second = renderHook(() =>
      useNoteAutosave(initialNote.id, ownerId, initialNote),
    );
    act(() => second.result.current.updateTitle("Unmount draft"));
    act(() => second.unmount());
    expect(updateNote).toHaveBeenCalledTimes(1);
    expect(readRecoverableDraft(ownerId, initialNote.id)).toEqual(
      expect.objectContaining({ title: "Unmount draft", baseRevision: 1 }),
    );
  });

  it("blocks saves and edits while reloading the confirmed server version", async () => {
    vi.mocked(updateNote).mockRejectedValueOnce(
      new ApiError(409, "Revision is stale.", {
        code: "revision_conflict",
        detail: "Revision is stale.",
        current: {
          id: initialNote.id,
          revision: 2,
          last_edited_at: "2004-08-17T12:01:00Z",
        },
      }),
    );
    const serverNote: NoteDetail = {
      ...initialNote,
      title: "Server title",
      revision: 2,
      lastEditedAt: "2004-08-17T12:01:00Z",
    };
    const reloadRequest = deferred<NoteDetail>();
    vi.mocked(getNote).mockReturnValueOnce(reloadRequest.promise);

    const { result } = renderHook(() =>
      useNoteAutosave(initialNote.id, ownerId, initialNote),
    );

    await act(async () => {
      result.current.updateTitle("Local conflicting title");
      await result.current.saveNow();
    });
    expect(result.current.saveState).toBe("conflict");

    let recovery!: Promise<boolean>;
    act(() => {
      recovery = result.current.reloadLatest();
    });

    expect(result.current.isReloading).toBe(true);
    expect(result.current.saveState).toBe("saving");

    act(() => {
      result.current.updateTitle("Edit attempted during reload");
      result.current.updateContent("Body attempted during reload");
      result.current.updateCategory("drama");
    });
    const blurFlush = result.current.saveNow();

    expect(result.current.draft.title).toBe("Local conflicting title");
    expect(result.current.draft.content).toBe(initialNote.content);
    expect(result.current.draft.category).toBe(initialNote.category);
    await expect(blurFlush).resolves.toBe(false);

    await act(async () => {
      reloadRequest.resolve(serverNote);
      await recovery;
    });

    expect(updateNote).toHaveBeenCalledTimes(1);
    expect(getNote).toHaveBeenCalledTimes(1);
    expect(result.current.draft).toEqual(serverNote);
    expect(result.current.saveState).toBe("saved");
    expect(result.current.isReloading).toBe(false);
  });
});
