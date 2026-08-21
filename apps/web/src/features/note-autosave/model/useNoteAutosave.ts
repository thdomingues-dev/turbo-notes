"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getNote, updateNote } from "@/entities/note/index.client";
import type { CategoryKey, NoteDetail, NotePatch } from "@/entities/note";
import {
  autosaveReducer,
  changedFields,
  createAutosaveState,
  isEmptyPatch,
  type AutosaveEvent,
} from "./autosave";
import {
  clearRecoverableDraft,
  getDraftSessionGeneration,
  readRecoverableDraft,
  writeRecoverableDraft,
} from "./recoverableDraft";
import { ApiError, isNotAuthenticatedError } from "@/shared/api/client";

export const SAVE_DEBOUNCE_MS = 600;
export const SAVE_MAX_WAIT_MS = 2_000;
export const RECOVERABLE_DRAFT_WRITE_DELAY_MS = 250;

interface AutosaveRuntime {
  debounceTimer: ReturnType<typeof setTimeout> | null;
  maxWaitTimer: ReturnType<typeof setTimeout> | null;
  recoveryTimer: ReturnType<typeof setTimeout> | null;
  dirtySince: number | null;
  inFlight: Promise<boolean> | null;
  reloading: boolean;
  mounted: boolean;
  draftSessionGeneration: number;
}

export function useNoteAutosave(
  noteId: string,
  ownerId: string,
  initialNote: NoteDetail,
  onAcknowledged?: (note: NoteDetail) => void,
  onNotAuthenticated?: () => void,
) {
  const [state, setState] = useState(() => createAutosaveState(initialNote));
  const machineRef = useRef(state);
  const runtimeRef = useRef<AutosaveRuntime>({
    debounceTimer: null,
    maxWaitTimer: null,
    recoveryTimer: null,
    dirtySince: null,
    inFlight: null,
    reloading: false,
    mounted: false,
    draftSessionGeneration: getDraftSessionGeneration(),
  });
  const send = useCallback((event: AutosaveEvent) => {
    const next = autosaveReducer(machineRef.current, event);
    machineRef.current = next;
    if (runtimeRef.current.mounted) setState(next);
    return next;
  }, []);

  const clearSaveTimers = useCallback(() => {
    const runtime = runtimeRef.current;
    if (runtime.debounceTimer) clearTimeout(runtime.debounceTimer);
    if (runtime.maxWaitTimer) clearTimeout(runtime.maxWaitTimer);
    runtime.debounceTimer = null;
    runtime.maxWaitTimer = null;
    runtime.dirtySince = null;
  }, []);

  const clearRecoveryTimer = useCallback(() => {
    const runtime = runtimeRef.current;
    if (runtime.recoveryTimer) clearTimeout(runtime.recoveryTimer);
    runtime.recoveryTimer = null;
  }, []);

  const writeDraft = useCallback(
    (draft: NoteDetail, baseRevision: number): boolean => {
      if (
        runtimeRef.current.draftSessionGeneration !==
        getDraftSessionGeneration()
      ) {
        return false;
      }
      return writeRecoverableDraft(ownerId, noteId, draft, baseRevision);
    },
    [noteId, ownerId],
  );

  const persistCurrentDraft = useCallback(() => {
    clearRecoveryTimer();
    if (
      runtimeRef.current.draftSessionGeneration !== getDraftSessionGeneration()
    ) {
      return;
    }
    const current = machineRef.current;
    if (
      isEmptyPatch(changedFields(current.draft, current.saved)) &&
      !runtimeRef.current.inFlight
    ) {
      clearRecoverableDraft(ownerId, noteId);
      return;
    }
    writeDraft(current.draft, current.saved.revision);
  }, [clearRecoveryTimer, noteId, ownerId, writeDraft]);

  const scheduleDraftPersistence = useCallback(() => {
    clearRecoveryTimer();
    runtimeRef.current.recoveryTimer = setTimeout(() => {
      runtimeRef.current.recoveryTimer = null;
      persistCurrentDraft();
    }, RECOVERABLE_DRAFT_WRITE_DELAY_MS);
  }, [clearRecoveryTimer, persistCurrentDraft]);

  const flush = useCallback(async (): Promise<boolean> => {
    clearSaveTimers();
    const runtime = runtimeRef.current;
    if (runtime.draftSessionGeneration !== getDraftSessionGeneration()) {
      return false;
    }
    if (machineRef.current.conflict || runtime.reloading) return false;
    if (runtime.inFlight) return runtime.inFlight;

    const saveLoop = async (): Promise<boolean> => {
      while (true) {
        const current = machineRef.current;
        const submitted = current.draft;
        const patch = changedFields(submitted, current.saved);
        if (isEmptyPatch(patch)) {
          clearRecoveryTimer();
          clearRecoverableDraft(ownerId, noteId);
          send({ type: "saveCompleted" });
          return true;
        }

        send({ type: "saveStarted" });
        try {
          const saved = await updateNote(noteId, {
            ...patch,
            revision: current.saved.revision,
          });
          const next = send({
            type: "saveAcknowledged",
            submitted,
            patch,
            saved,
          });
          onAcknowledged?.(saved);

          if (isEmptyPatch(changedFields(next.draft, next.saved))) {
            clearSaveTimers();
            clearRecoveryTimer();
            clearRecoverableDraft(ownerId, noteId);
            send({ type: "saveCompleted" });
            return true;
          }

          clearSaveTimers();
          clearRecoveryTimer();
          writeDraft(next.draft, next.saved.revision);
        } catch (error) {
          const conflict = error instanceof ApiError && error.status === 409;
          const latest = machineRef.current;
          clearRecoveryTimer();
          const draftStored = writeDraft(latest.draft, latest.saved.revision);
          send({
            type: "saveFailed",
            conflict,
            message: conflict
              ? draftStored
                ? "This note changed in another session. Your draft is still safe here."
                : "This note changed in another session, and browser recovery is unavailable. Keep this tab open while you resolve the conflict."
              : error instanceof Error
                ? error.message
                : "Unable to save this note.",
          });
          if (isNotAuthenticatedError(error)) onNotAuthenticated?.();
          return false;
        }
      }
    };

    const request = saveLoop();
    runtime.inFlight = request;
    try {
      return await request;
    } finally {
      if (runtime.inFlight === request) runtime.inFlight = null;
    }
  }, [
    clearRecoveryTimer,
    clearSaveTimers,
    noteId,
    onAcknowledged,
    onNotAuthenticated,
    ownerId,
    send,
    writeDraft,
  ]);

  const scheduleSave = useCallback(() => {
    const runtime = runtimeRef.current;
    const now = Date.now();
    runtime.dirtySince ??= now;
    if (runtime.debounceTimer) clearTimeout(runtime.debounceTimer);
    runtime.debounceTimer = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    runtime.maxWaitTimer ??= setTimeout(
      () => void flush(),
      Math.max(0, SAVE_MAX_WAIT_MS - (now - runtime.dirtySince)),
    );
  }, [flush]);

  const applyPatch = useCallback(
    (patch: NotePatch, immediate = false) => {
      if (runtimeRef.current.reloading) return;

      const previous = machineRef.current;
      const next = send({
        type: "edited",
        patch,
        saving: Boolean(runtimeRef.current.inFlight),
      });
      if (next === previous) return;

      scheduleDraftPersistence();
      if (next.conflict) return;
      if (immediate) void flush();
      else scheduleSave();
    },
    [flush, scheduleDraftPersistence, scheduleSave, send],
  );

  const reloadLatest = useCallback(async (): Promise<boolean> => {
    const runtime = runtimeRef.current;
    if (runtime.reloading) return false;
    runtime.reloading = true;
    clearSaveTimers();
    send({ type: "reloadStarted" });
    try {
      const latest = await getNote(noteId);
      onAcknowledged?.(latest);
      clearRecoveryTimer();
      clearRecoverableDraft(ownerId, noteId);
      send({ type: "reloadCompleted", latest });
      return true;
    } catch (error) {
      send({
        type: "reloadFailed",
        message:
          error instanceof Error
            ? error.message
            : "Unable to reload this note.",
      });
      if (isNotAuthenticatedError(error)) onNotAuthenticated?.();
      return false;
    } finally {
      runtime.reloading = false;
    }
  }, [
    clearRecoveryTimer,
    clearSaveTimers,
    noteId,
    onAcknowledged,
    onNotAuthenticated,
    ownerId,
    send,
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    runtime.mounted = true;

    const recovered = readRecoverableDraft(ownerId, noteId);
    if (recovered) {
      const before = machineRef.current;
      const next = send({ type: "draftRecovered", recovered });
      if (next === before) clearRecoverableDraft(ownerId, noteId);
    }

    function flushForLifecycle() {
      persistCurrentDraft();
      void flush();
    }

    function flushWhenHidden() {
      if (document.visibilityState === "hidden") flushForLifecycle();
    }

    document.addEventListener("visibilitychange", flushWhenHidden);
    window.addEventListener("pagehide", flushForLifecycle);
    return () => {
      persistCurrentDraft();
      runtime.mounted = false;
      clearSaveTimers();
      document.removeEventListener("visibilitychange", flushWhenHidden);
      window.removeEventListener("pagehide", flushForLifecycle);
    };
  }, [clearSaveTimers, flush, noteId, ownerId, persistCurrentDraft, send]);

  return {
    draft: state.draft,
    saveState: state.saveState,
    saveError: state.saveError,
    isReloading: state.isReloading,
    updateTitle: (title: string) => applyPatch({ title }),
    updateContent: (content: string) => applyPatch({ content }),
    updateCategory: (categoryKey: CategoryKey) =>
      applyPatch({ categoryKey }, true),
    saveNow: flush,
    retry: flush,
    reloadLatest,
  };
}
