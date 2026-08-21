"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import {
  getCategories,
  getNotes,
  noteKeys,
} from "@/entities/note/index.client";
import type { CategoryFilterKey, NoteListItem } from "@/entities/note";

function asError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

export function useNotesIndex(
  category: CategoryFilterKey,
  ownerId: string | null,
) {
  const categoriesQuery = useQuery({
    queryKey: noteKeys.categories(ownerId),
    queryFn: ({ signal }) => getCategories(signal),
    enabled: ownerId !== null,
  });
  const notesQuery = useInfiniteQuery({
    queryKey: noteKeys.list(ownerId, category),
    queryFn: ({ pageParam, signal }) =>
      getNotes({
        category,
        ...(pageParam === null ? {} : { pageUrl: pageParam }),
        signal,
      }),
    enabled: ownerId !== null,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
  });

  const notes = useMemo(() => {
    const knownIds = new Set<string>();
    const flattened: NoteListItem[] = [];
    for (const page of notesQuery.data?.pages ?? []) {
      for (const note of page.results) {
        if (knownIds.has(note.id)) continue;
        knownIds.add(note.id);
        flattened.push(note);
      }
    }
    return flattened;
  }, [notesQuery.data]);

  const refetchCategories = categoriesQuery.refetch;
  const refetchNotes = notesQuery.refetch;
  const fetchNextPage = notesQuery.fetchNextPage;
  const hasNextPage = notesQuery.hasNextPage;
  const isFetchingNextPage = notesQuery.isFetchingNextPage;

  const retry = useCallback(() => {
    void Promise.all([refetchCategories(), refetchNotes()]);
  }, [refetchCategories, refetchNotes]);

  const loadMore = useCallback(async () => {
    if (!hasNextPage || isFetchingNextPage) return;
    await fetchNextPage({ cancelRefetch: false });
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const status =
    ownerId === null || notesQuery.isPending
      ? "loading"
      : notesQuery.isError && notesQuery.data === undefined
        ? "error"
        : "success";
  const lastPage = notesQuery.data?.pages.at(-1);

  return {
    status,
    categories: categoriesQuery.data ?? [],
    notes,
    next: lastPage?.next ?? null,
    error: notesQuery.error
      ? asError(notesQuery.error, "Unable to load notes.")
      : null,
    categoriesError: categoriesQuery.error
      ? asError(categoriesQuery.error, "Unable to load category counts.")
      : null,
    isLoadingMore: notesQuery.isFetchingNextPage,
    loadMoreError:
      notesQuery.isFetchNextPageError && notesQuery.error
        ? asError(notesQuery.error, "Unable to load more notes.")
        : null,
    retry,
    retryCategories: () => void categoriesQuery.refetch(),
    loadMore,
  } as const;
}
