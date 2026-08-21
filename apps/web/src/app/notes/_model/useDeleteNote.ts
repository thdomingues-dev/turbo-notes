"use client";

import {
  type InfiniteData,
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import type {
  CategoryKey,
  CategoryWithCount,
  NoteDetail,
  NoteListItem,
  PaginatedPage,
} from "@/entities/note";
import { deleteNote, noteKeys } from "@/entities/note/index.client";
import { clearRecoverableDraft } from "@/features/note-autosave";
import { ApiError, isNotAuthenticatedError } from "@/shared/api/client";

interface DeleteNoteOptions {
  ownerId: string | null;
  onNotAuthenticated: () => void;
}

interface PendingDeletion {
  noteId: string;
  ownerId: string;
}

type NotesInfiniteData = InfiniteData<
  PaginatedPage<NoteListItem>,
  string | null
>;

function cachedDeletionCategory(
  queryClient: QueryClient,
  ownerId: string,
  noteId: string,
): CategoryKey | null {
  const categories = new Set<CategoryKey>();
  const detail = queryClient.getQueryData<NoteDetail>(
    noteKeys.detail(ownerId, noteId),
  );
  if (detail) categories.add(detail.category.key);

  for (const [, data] of queryClient.getQueriesData<NotesInfiniteData>({
    queryKey: noteKeys.lists(ownerId),
  })) {
    for (const page of data?.pages ?? []) {
      for (const note of page.results) {
        if (note.id === noteId) categories.add(note.category.key);
      }
    }
  }

  return categories.size === 1 ? ([...categories][0] ?? null) : null;
}

function withoutNote(
  data: NotesInfiniteData | undefined,
  noteId: string,
): NotesInfiniteData | undefined {
  if (!data) return data;
  let changed = false;
  const pages = data.pages.map((page) => {
    const results = page.results.filter((note) => note.id !== noteId);
    if (results.length === page.results.length) return page;
    changed = true;
    return { ...page, results };
  });
  return changed ? { ...data, pages } : data;
}

function reconcileDeletedNote(
  queryClient: QueryClient,
  ownerId: string,
  noteId: string,
): void {
  const category = cachedDeletionCategory(queryClient, ownerId, noteId);

  queryClient.setQueriesData<NotesInfiniteData>(
    { queryKey: noteKeys.lists(ownerId) },
    (data) => withoutNote(data, noteId),
  );
  queryClient.removeQueries({
    queryKey: noteKeys.detail(ownerId, noteId),
    exact: true,
  });
  clearRecoverableDraft(ownerId, noteId);

  if (category) {
    queryClient.setQueryData<CategoryWithCount[]>(
      noteKeys.categories(ownerId),
      (categories) =>
        categories?.map((candidate) =>
          candidate.key === category &&
          candidate.noteCount !== null &&
          candidate.noteCount > 0
            ? { ...candidate, noteCount: candidate.noteCount - 1 }
            : candidate,
        ),
    );
  }
}

export function useDeleteNote({
  ownerId,
  onNotAuthenticated,
}: DeleteNoteOptions) {
  const queryClient = useQueryClient();
  const requestRef = useRef<Promise<void> | null>(null);
  const mutation = useMutation({
    mutationFn: async ({
      noteId,
      ownerId: deletionOwnerId,
    }: PendingDeletion) => {
      try {
        await deleteNote(noteId);
      } catch (deletionError) {
        const isAlreadyAbsent =
          deletionError instanceof ApiError && deletionError.status === 404;
        if (!isAlreadyAbsent) {
          throw deletionError;
        }
      }

      reconcileDeletedNote(queryClient, deletionOwnerId, noteId);
      void Promise.allSettled([
        queryClient.invalidateQueries({
          queryKey: noteKeys.lists(deletionOwnerId),
        }),
        queryClient.invalidateQueries({
          queryKey: noteKeys.categories(deletionOwnerId),
        }),
      ]);
    },
  });
  const { error, isPending, mutateAsync, reset } = mutation;

  const remove = useCallback(
    async (noteId: string): Promise<boolean> => {
      if (requestRef.current) return false;
      if (!ownerId) {
        onNotAuthenticated();
        return false;
      }
      reset();

      const request = mutateAsync({ noteId, ownerId });
      requestRef.current = request;
      try {
        await request;
        return true;
      } catch (deletionError) {
        if (isNotAuthenticatedError(deletionError)) onNotAuthenticated();
        return false;
      } finally {
        if (requestRef.current === request) requestRef.current = null;
      }
    },
    [mutateAsync, onNotAuthenticated, ownerId, reset],
  );

  return {
    remove,
    reset,
    isDeleting: isPending,
    error: error
      ? error instanceof Error
        ? error.message
        : "Unable to delete this note."
      : null,
  } as const;
}
