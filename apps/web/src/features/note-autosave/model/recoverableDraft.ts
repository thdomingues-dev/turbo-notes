import "client-only";

import {
  isCategoryKey,
  NOTE_CONTENT_MAX_LENGTH,
  NOTE_TITLE_MAX_LENGTH,
  type CategoryKey,
  type NoteDetail,
} from "@/entities/note";

const STORAGE_NAMESPACE_PREFIX = "turbo-notes:recoverable-draft:";
const STORAGE_PREFIX = `${STORAGE_NAMESPACE_PREFIX}v1:`;
const STORAGE_VERSION = 1;
export const RECOVERABLE_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
let draftSessionGeneration = 0;

interface RecoverableDraft {
  ownerId: string;
  noteId: string;
  title: string;
  content: string;
  categoryKey: CategoryKey;
  baseRevision: number;
  updatedAt: number;
}

interface StoredRecoverableDraft extends RecoverableDraft {
  version: typeof STORAGE_VERSION;
}

function storageKey(ownerId: string, noteId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(ownerId)}:${encodeURIComponent(noteId)}`;
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isStoredDraft(
  value: unknown,
  ownerId: string,
  noteId: string,
  now: number,
): value is StoredRecoverableDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const draft = value as Record<string, unknown>;
  return (
    draft.version === STORAGE_VERSION &&
    draft.ownerId === ownerId &&
    draft.noteId === noteId &&
    typeof draft.title === "string" &&
    draft.title.length <= NOTE_TITLE_MAX_LENGTH &&
    typeof draft.content === "string" &&
    draft.content.length <= NOTE_CONTENT_MAX_LENGTH &&
    typeof draft.categoryKey === "string" &&
    isCategoryKey(draft.categoryKey) &&
    typeof draft.baseRevision === "number" &&
    Number.isSafeInteger(draft.baseRevision) &&
    draft.baseRevision >= 0 &&
    typeof draft.updatedAt === "number" &&
    Number.isFinite(draft.updatedAt) &&
    draft.updatedAt <= now &&
    now - draft.updatedAt <= RECOVERABLE_DRAFT_MAX_AGE_MS
  );
}

export function readRecoverableDraft(
  ownerId: string,
  noteId: string,
  now = Date.now(),
): RecoverableDraft | null {
  const storage = browserStorage();
  if (!storage) return null;
  const key = storageKey(ownerId, noteId);

  try {
    const serialized = storage.getItem(key);
    if (serialized === null) return null;
    const value: unknown = JSON.parse(serialized);
    if (!isStoredDraft(value, ownerId, noteId, now)) {
      storage.removeItem(key);
      return null;
    }
    return {
      ownerId: value.ownerId,
      noteId: value.noteId,
      title: value.title,
      content: value.content,
      categoryKey: value.categoryKey,
      baseRevision: value.baseRevision,
      updatedAt: value.updatedAt,
    };
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage may have become unavailable between the read and cleanup attempt.
    }
    return null;
  }
}

export function writeRecoverableDraft(
  ownerId: string,
  noteId: string,
  draft: NoteDetail,
  baseRevision: number,
  now = Date.now(),
): boolean {
  const storage = browserStorage();
  if (!storage) return false;
  const value: StoredRecoverableDraft = {
    version: STORAGE_VERSION,
    ownerId,
    noteId,
    title: draft.title,
    content: draft.content,
    categoryKey: draft.category.key,
    baseRevision,
    updatedAt: now,
  };

  try {
    storage.setItem(storageKey(ownerId, noteId), JSON.stringify(value));
    return true;
  } catch {
    // Saving still proceeds over the network when browser storage is unavailable or full.
    return false;
  }
}

export function clearRecoverableDraft(ownerId: string, noteId: string): void {
  try {
    browserStorage()?.removeItem(storageKey(ownerId, noteId));
  } catch {
    // A successful server acknowledgement remains authoritative even if cleanup is unavailable.
  }
}

export function clearAllRecoverableDrafts(): void {
  draftSessionGeneration += 1;
  const storage = browserStorage();
  if (!storage) return;

  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(STORAGE_NAMESPACE_PREFIX)) storage.removeItem(key);
    }
  } catch {
    // Logout still completes if origin storage is blocked.
  }
}

export function getDraftSessionGeneration(): number {
  return draftSessionGeneration;
}

export function sweepExpiredRecoverableDrafts(now = Date.now()): void {
  const storage = browserStorage();
  if (!storage) return;

  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (!key?.startsWith(STORAGE_NAMESPACE_PREFIX)) continue;

      let valid = false;
      try {
        const serialized = storage.getItem(key);
        const value: unknown =
          serialized === null ? null : JSON.parse(serialized);
        if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value)
        ) {
          const candidate = value as Record<string, unknown>;
          if (
            typeof candidate.ownerId === "string" &&
            typeof candidate.noteId === "string"
          ) {
            valid = isStoredDraft(
              value,
              candidate.ownerId,
              candidate.noteId,
              now,
            );
          }
        }
      } catch {
        valid = false;
      }

      if (!valid) storage.removeItem(key);
    }
  } catch {
    // Draft maintenance must never prevent the application from rendering.
  }
}
