import {
  CATEGORY_DEFINITIONS,
  type CategoryKey,
  type NoteDetail,
  type NotePatch,
} from "@/entities/note";

export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

interface AutosaveState {
  draft: NoteDetail;
  saved: NoteDetail;
  saveState: SaveState;
  saveError: string | null;
  conflict: boolean;
  isReloading: boolean;
}

interface RecoveredDraftSnapshot {
  title: string;
  content: string;
  categoryKey: CategoryKey;
  baseRevision: number;
}

export type AutosaveEvent =
  | { type: "draftRecovered"; recovered: RecoveredDraftSnapshot }
  | { type: "edited"; patch: NotePatch; saving: boolean }
  | { type: "saveStarted" }
  | {
      type: "saveAcknowledged";
      submitted: NoteDetail;
      patch: NotePatch;
      saved: NoteDetail;
    }
  | { type: "saveCompleted" }
  | { type: "saveFailed"; conflict: boolean; message: string }
  | { type: "reloadStarted" }
  | { type: "reloadCompleted"; latest: NoteDetail }
  | { type: "reloadFailed"; message: string };

export function createAutosaveState(note: NoteDetail): AutosaveState {
  return {
    draft: note,
    saved: note,
    saveState: "saved",
    saveError: null,
    conflict: false,
    isReloading: false,
  };
}

export function changedFields(draft: NoteDetail, saved: NoteDetail): NotePatch {
  return {
    ...(draft.title === saved.title ? {} : { title: draft.title }),
    ...(draft.content === saved.content ? {} : { content: draft.content }),
    ...(draft.category.key === saved.category.key
      ? {}
      : { categoryKey: draft.category.key }),
  };
}

export function isEmptyPatch(patch: NotePatch): boolean {
  return Object.keys(patch).length === 0;
}

function applyPatch(draft: NoteDetail, patch: NotePatch): NoteDetail {
  return {
    ...draft,
    ...(patch.title === undefined ? {} : { title: patch.title }),
    ...(patch.content === undefined ? {} : { content: patch.content }),
    ...(patch.categoryKey === undefined
      ? {}
      : { category: CATEGORY_DEFINITIONS[patch.categoryKey] }),
  };
}

function recoverDraft(
  state: AutosaveState,
  recovered: RecoveredDraftSnapshot,
): AutosaveState {
  const draft = applyPatch(state.saved, {
    title: recovered.title,
    content: recovered.content,
    categoryKey: recovered.categoryKey,
  });
  if (isEmptyPatch(changedFields(draft, state.saved))) return state;

  const conflict = recovered.baseRevision !== state.saved.revision;
  return {
    ...state,
    draft,
    saveState: conflict ? "conflict" : "error",
    saveError: conflict
      ? "A recovered draft is based on an older server version. Your draft is still safe here."
      : "Recovered an unsaved draft from this browser. Retry when you are ready.",
    conflict,
  };
}

function reconcileAcknowledgement(
  current: NoteDetail,
  submitted: NoteDetail,
  patch: NotePatch,
  saved: NoteDetail,
): NoteDetail {
  return {
    ...current,
    ...(patch.title !== undefined && current.title === submitted.title
      ? { title: saved.title }
      : {}),
    ...(patch.content !== undefined && current.content === submitted.content
      ? { content: saved.content }
      : {}),
    ...(patch.categoryKey !== undefined &&
    current.category.key === submitted.category.key
      ? { category: saved.category }
      : {}),
    revision: saved.revision,
    lastEditedAt: saved.lastEditedAt,
  };
}

export function autosaveReducer(
  state: AutosaveState,
  event: AutosaveEvent,
): AutosaveState {
  switch (event.type) {
    case "draftRecovered":
      return recoverDraft(state, event.recovered);
    case "edited": {
      const draft = applyPatch(state.draft, event.patch);
      if (isEmptyPatch(changedFields(draft, state.draft))) return state;
      return {
        ...state,
        draft,
        saveState: state.conflict
          ? "conflict"
          : event.saving
            ? "saving"
            : "dirty",
        saveError: state.conflict ? state.saveError : null,
      };
    }
    case "saveStarted":
      return { ...state, saveState: "saving", saveError: null };
    case "reloadStarted":
      return {
        ...state,
        saveState: "saving",
        saveError: null,
        isReloading: true,
      };
    case "saveAcknowledged":
      return {
        ...state,
        draft: reconcileAcknowledgement(
          state.draft,
          event.submitted,
          event.patch,
          event.saved,
        ),
        saved: event.saved,
        conflict: false,
      };
    case "saveCompleted":
      return {
        ...state,
        saveState: "saved",
        saveError: null,
        conflict: false,
      };
    case "saveFailed":
      return {
        ...state,
        saveState: event.conflict ? "conflict" : "error",
        saveError: event.message,
        conflict: event.conflict,
      };
    case "reloadCompleted":
      return createAutosaveState(event.latest);
    case "reloadFailed":
      return {
        ...state,
        saveState: state.conflict ? "conflict" : "error",
        saveError: event.message,
        isReloading: false,
      };
  }
}
