"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  type AuthenticatedSession,
  useAuthTransition,
  useAuthenticatedSession,
} from "@/features/auth";
import { getNote, noteKeys } from "@/entities/note/index.client";
import {
  notesPath,
  type CategoryFilterKey,
  type NoteDetail,
} from "@/entities/note";
import {
  clearRecoverableNoteDrafts,
  useNoteAutosave,
} from "@/features/note-autosave";
import { ApiError, isNotAuthenticatedError } from "@/shared/api/client";
import { ErrorState, PageLoadingState } from "@/shared/ui/AsyncState";
import { NoteEditorView } from "./NoteEditorView";
import { NoteNotFoundState } from "./NoteNotFoundState";

interface NoteEditorScreenProps {
  noteId: string;
  returnCategory: CategoryFilterKey;
  initialSession?: AuthenticatedSession;
}

export const NoteEditorScreen = ({
  noteId,
  returnCategory,
  initialSession,
}: NoteEditorScreenProps) => {
  const transitionToSignedOut = useAuthTransition(
    "/login",
    clearRecoverableNoteDrafts,
  );
  const session = useAuthenticatedSession({
    onSignedOut: transitionToSignedOut,
    ...(initialSession ? { initialSession } : {}),
  });
  const noteQuery = useQuery({
    queryKey: noteKeys.detail(session.ownerId, noteId),
    queryFn: ({ signal }) => getNote(noteId, signal),
    enabled: session.ownerId !== null,
  });
  const requestError = noteQuery.error ?? session.blockingError;

  useEffect(() => {
    if (isNotAuthenticatedError(noteQuery.error)) transitionToSignedOut();
  }, [noteQuery.error, transitionToSignedOut]);

  if (requestError && !isNotAuthenticatedError(requestError)) {
    if (requestError instanceof ApiError && requestError.status === 404) {
      return (
        <main className="min-h-dvh">
          <NoteNotFoundState />
        </main>
      );
    }
    return (
      <main className="min-h-dvh">
        <ErrorState
          title={
            session.blockingError
              ? "We couldn’t verify your session."
              : "We couldn’t load this note."
          }
          error={
            requestError instanceof Error
              ? requestError
              : new Error("Unable to load this note.")
          }
          onRetry={() => {
            if (session.blockingError) session.retry();
            else void noteQuery.refetch();
          }}
        />
      </main>
    );
  }
  if (noteQuery.isPending || session.isPending) {
    return <PageLoadingState label="Opening note" />;
  }
  if (!noteQuery.data || !session.ownerId || !session.user) {
    return <PageLoadingState label="Opening note" />;
  }

  return (
    <ConnectedNoteEditor
      key={noteQuery.data.id}
      note={noteQuery.data}
      ownerId={session.ownerId}
      returnCategory={returnCategory}
      sessionRefreshFailed={session.backgroundError !== null}
      onRetrySession={session.retry}
      onNotAuthenticated={transitionToSignedOut}
    />
  );
};

interface ConnectedNoteEditorProps {
  note: NoteDetail;
  ownerId: string;
  returnCategory: CategoryFilterKey;
  sessionRefreshFailed: boolean;
  onRetrySession: () => void;
  onNotAuthenticated: () => void;
}

const ConnectedNoteEditor = ({
  note,
  ownerId,
  returnCategory,
  sessionRefreshFailed,
  onRetrySession,
  onNotAuthenticated,
}: ConnectedNoteEditorProps) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isClosing, setIsClosing] = useState(false);
  const acknowledgeNote = useCallback(
    (acknowledged: NoteDetail) => {
      queryClient.setQueryData(
        noteKeys.detail(ownerId, acknowledged.id),
        acknowledged,
      );
      void queryClient.invalidateQueries({ queryKey: noteKeys.lists(ownerId) });
      void queryClient.invalidateQueries({
        queryKey: noteKeys.categories(ownerId),
      });
    },
    [ownerId, queryClient],
  );
  const editor = useNoteAutosave(
    note.id,
    ownerId,
    note,
    acknowledgeNote,
    onNotAuthenticated,
  );

  const handleCloseEditor = async () => {
    if (isClosing) return;
    setIsClosing(true);
    const saved = await editor.saveNow();
    if (saved) router.replace(notesPath(returnCategory));
    else setIsClosing(false);
  };

  return (
    <NoteEditorView
      draft={editor.draft}
      saveState={editor.saveState}
      saveError={editor.saveError}
      isClosing={isClosing}
      isReloading={editor.isReloading}
      sessionRefreshFailed={sessionRefreshFailed}
      onTitleChange={editor.updateTitle}
      onContentChange={editor.updateContent}
      onCategoryChange={editor.updateCategory}
      onSave={editor.saveNow}
      onClose={handleCloseEditor}
      onRetry={editor.retry}
      onReloadLatest={editor.reloadLatest}
      onRetrySession={onRetrySession}
    />
  );
};
