"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import { createNote, noteKeys } from "@/entities/note/index.client";
import type {
  CategoryFilterKey,
  CategoryKey,
  NoteDetail,
} from "@/entities/note";
import { isNotAuthenticatedError } from "@/shared/api/client";

interface PendingCreation {
  category: CategoryKey;
  returnCategory: CategoryFilterKey;
  idempotencyKey: string;
}

interface CreateNoteOptions {
  ownerId: string | null;
  onCreated: (note: NoteDetail, returnCategory: CategoryFilterKey) => void;
  onNotAuthenticated: () => void;
}

export function useCreateNote({
  ownerId,
  onCreated,
  onNotAuthenticated,
}: CreateNoteOptions) {
  const queryClient = useQueryClient();
  const [pendingCreation, setPendingCreation] =
    useState<PendingCreation | null>(null);
  const requestRef = useRef<Promise<NoteDetail> | null>(null);
  const mutation = useMutation({
    mutationFn: (pending: PendingCreation) =>
      createNote(pending.category, pending.idempotencyKey),
  });
  const { error, isPending, mutateAsync, reset } = mutation;

  const submit = useCallback(
    async (pending: PendingCreation) => {
      if (requestRef.current) return;
      if (!ownerId) {
        onNotAuthenticated();
        return;
      }
      reset();

      const request = mutateAsync(pending);
      requestRef.current = request;
      try {
        const note = await request;
        setPendingCreation(null);
        queryClient.setQueryData(noteKeys.detail(ownerId, note.id), note);
        void queryClient.invalidateQueries({
          queryKey: noteKeys.lists(ownerId),
        });
        void queryClient.invalidateQueries({
          queryKey: noteKeys.categories(ownerId),
        });
        onCreated(note, pending.returnCategory);
      } catch (creationError) {
        if (isNotAuthenticatedError(creationError)) {
          setPendingCreation(null);
          onNotAuthenticated();
        }
      } finally {
        if (requestRef.current === request) requestRef.current = null;
      }
    },
    [mutateAsync, onCreated, onNotAuthenticated, ownerId, queryClient, reset],
  );

  const create = useCallback(
    (category: CategoryKey, returnCategory: CategoryFilterKey) => {
      if (requestRef.current || pendingCreation) return;
      const pending: PendingCreation = {
        category,
        returnCategory,
        idempotencyKey: globalThis.crypto.randomUUID(),
      };
      setPendingCreation(pending);
      void submit(pending);
    },
    [pendingCreation, submit],
  );

  const retry = useCallback(() => {
    if (pendingCreation) void submit(pendingCreation);
  }, [pendingCreation, submit]);

  const cancel = useCallback(() => {
    if (requestRef.current) return;
    setPendingCreation(null);
    reset();
  }, [reset]);

  return {
    create,
    retry,
    cancel,
    isCreating: isPending,
    hasPendingCreation: pendingCreation !== null,
    pendingCategory: pendingCreation?.category ?? null,
    error: error
      ? error instanceof Error
        ? error.message
        : "Unable to create a note."
      : null,
  } as const;
}
