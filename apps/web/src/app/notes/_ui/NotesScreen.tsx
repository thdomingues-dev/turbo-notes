"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  SessionRefreshWarning,
  type AuthenticatedSession,
  useAuthTransition,
  useAuthenticatedSession,
  useLogout,
} from "@/features/auth";
import {
  CATEGORIES,
  CATEGORY_DEFINITIONS,
  DEFAULT_CATEGORY_KEY,
  isCategoryFilterKey,
  noteEditorPath,
  notesPath,
  type CategoryFilterKey,
  type NoteListItem,
} from "@/entities/note";
import { clearRecoverableNoteDrafts } from "@/features/note-autosave";
import { isNotAuthenticatedError } from "@/shared/api/client";
import { ErrorState } from "@/shared/ui/AsyncState";
import { Button } from "@/shared/ui/Button";
import { useCreateNote } from "../_model/useCreateNote";
import { useDeleteNote } from "../_model/useDeleteNote";
import { useNotesIndex } from "../_model/useNotesIndex";
import { DeleteNoteDialog } from "./DeleteNoteDialog";
import { NewNoteButton } from "./NewNoteButton";
import { NotesGrid } from "./NotesGrid";
import { NotesSidebar } from "./NotesSidebar";

const CATEGORY_PLACEHOLDERS = CATEGORIES.map((category) => ({
  ...category,
  noteCount: null,
}));

interface NotesScreenProps {
  initialSession?: AuthenticatedSession;
}

export const NotesScreen = ({ initialSession }: NotesScreenProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const transitionToSignedOut = useAuthTransition(
    "/login",
    clearRecoverableNoteDrafts,
  );
  const session = useAuthenticatedSession({
    onSignedOut: transitionToSignedOut,
    ...(initialSession ? { initialSession } : {}),
  });
  const requestedCategory = searchParams.get("category");
  const category: CategoryFilterKey = isCategoryFilterKey(requestedCategory)
    ? requestedCategory
    : "all";
  const notesState = useNotesIndex(category, session.ownerId);
  const [notePendingDelete, setNotePendingDelete] =
    useState<NoteListItem | null>(null);
  const mobileNewNoteRef = useRef<HTMLButtonElement>(null);
  const desktopNewNoteRef = useRef<HTMLButtonElement>(null);

  const focusNewNote = useCallback(() => {
    const buttons = [
      mobileNewNoteRef.current,
      desktopNewNoteRef.current,
    ].filter((button): button is HTMLButtonElement => button !== null);
    const visibleButton = buttons.find(
      (button) => button.getClientRects().length > 0,
    );
    (visibleButton ?? buttons[0])?.focus();
  }, []);

  const onCreated = useCallback(
    (note: { id: string }, returnCategory: CategoryFilterKey) => {
      router.push(noteEditorPath(note.id, returnCategory));
    },
    [router],
  );
  const creation = useCreateNote({
    ownerId: session.ownerId,
    onCreated,
    onNotAuthenticated: transitionToSignedOut,
  });
  const deletion = useDeleteNote({
    ownerId: session.ownerId,
    onNotAuthenticated: transitionToSignedOut,
  });
  const logout = useLogout({ onSignedOut: transitionToSignedOut });
  const categories = useMemo(
    () =>
      notesState.categories.length > 0
        ? notesState.categories
        : CATEGORY_PLACEHOLDERS,
    [notesState.categories],
  );

  const handleCategoryChange = (nextCategory: CategoryFilterKey) => {
    window.history.replaceState(null, "", notesPath(nextCategory));
  };

  const handleCreateNote = () => {
    creation.create(
      category === "all" ? DEFAULT_CATEGORY_KEY : category,
      category,
    );
  };

  const handleRequestDelete = (note: NoteListItem) => {
    deletion.reset();
    setNotePendingDelete(note);
  };

  const handleCancelDelete = () => {
    if (deletion.isDeleting) return;
    deletion.reset();
    setNotePendingDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!notePendingDelete) return;
    if (await deletion.remove(notePendingDelete.id)) {
      setNotePendingDelete(null);
      window.setTimeout(focusNewNote, 0);
    }
  };

  useEffect(() => {
    if (
      isNotAuthenticatedError(notesState.error) ||
      isNotAuthenticatedError(notesState.categoriesError)
    ) {
      transitionToSignedOut();
    }
  }, [notesState.categoriesError, notesState.error, transitionToSignedOut]);

  if (
    session.blockingError &&
    !isNotAuthenticatedError(session.blockingError)
  ) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <ErrorState
          title="We couldn’t verify your session."
          error={
            session.blockingError instanceof Error
              ? session.blockingError
              : new Error("Unable to verify your session.")
          }
          onRetry={session.retry}
        />
      </main>
    );
  }

  return (
    <main className="relative mx-auto min-h-dvh w-full px-4 pt-[max(12px,env(safe-area-inset-top))] pb-[max(32px,env(safe-area-inset-bottom))] sm:px-6 lg:max-w-7xl lg:pt-25.25 lg:pr-8.5 lg:pb-12 lg:pl-5.75">
      <h1 className="hidden lg:absolute lg:-m-px lg:block lg:size-px lg:overflow-hidden lg:border-0 lg:p-0 lg:whitespace-nowrap lg:[clip-path:inset(50%)] lg:[clip:rect(0,0,0,0)]">
        My Notes
      </h1>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-[linear-gradient(var(--color-canvas)_80%,transparent)] py-2 pb-3 lg:hidden">
        <h1 className="text-[1.75rem]">My Notes</h1>
        <NewNoteButton
          buttonRef={mobileNewNoteRef}
          isCreating={creation.isCreating}
          disabled={creation.isCreating || creation.hasPendingCreation}
          onClick={handleCreateNote}
        />
      </header>

      <div className="hidden lg:absolute lg:top-9.75 lg:right-8.5 lg:block">
        <NewNoteButton
          buttonRef={desktopNewNoteRef}
          isCreating={creation.isCreating}
          disabled={creation.isCreating || creation.hasPendingCreation}
          onClick={handleCreateNote}
        />
      </div>

      <div className="grid min-w-0 gap-5 sm:grid-cols-[168px_minmax(0,1fr)] lg:grid-cols-[var(--spacing-sidebar-width)_minmax(0,1fr)] lg:gap-8">
        <NotesSidebar
          categories={categories}
          category={category}
          isLoggingOut={logout.isLoggingOut}
          logoutError={logout.error}
          onCategoryChange={handleCategoryChange}
          onLogout={() => void logout.logout()}
        />

        <div className="min-w-0">
          {session.backgroundError ? (
            <div className="mb-3">
              <SessionRefreshWarning onRetry={session.retry} />
            </div>
          ) : null}
          {notesState.categoriesError &&
          !isNotAuthenticatedError(notesState.categoriesError) ? (
            <p className="mb-3 text-sm text-(--color-danger)" role="alert">
              Category counts are unavailable.{" "}
              <Button
                className="px-1 text-inherit"
                variant="text"
                size="sm"
                onClick={notesState.retryCategories}
              >
                Retry
              </Button>
            </p>
          ) : null}
          <div
            className="min-h-5.5 text-right text-sm text-(--color-danger) lg:absolute lg:top-18.5 lg:right-8.5 lg:min-h-0 lg:max-w-160"
            aria-live="polite"
          >
            {creation.error ? (
              <p role="alert">
                {creation.error}{" "}
                {creation.pendingCategory ? (
                  <span>
                    Retry targets{" "}
                    {CATEGORY_DEFINITIONS[creation.pendingCategory].name}.{" "}
                  </span>
                ) : null}
                <Button
                  className="min-h-0 px-0 font-bold text-inherit"
                  variant="text"
                  size="sm"
                  onClick={creation.retry}
                >
                  Try again
                </Button>
                {" · "}
                <Button
                  className="min-h-0 px-0 text-inherit"
                  variant="text"
                  size="sm"
                  onClick={creation.cancel}
                >
                  Cancel
                </Button>
              </p>
            ) : null}
          </div>

          <NotesGrid
            category={category}
            state={notesState}
            onRequestDelete={handleRequestDelete}
          />
        </div>
      </div>
      {notePendingDelete ? (
        <DeleteNoteDialog
          key={notePendingDelete.id}
          noteTitle={notePendingDelete.title}
          isDeleting={deletion.isDeleting}
          error={deletion.error}
          onCancel={handleCancelDelete}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}
    </main>
  );
};
