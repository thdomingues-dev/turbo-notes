"use client";

import { type SyntheticEvent, useEffect, useRef } from "react";

import { Button } from "@/shared/ui/Button";

interface DeleteNoteDialogProps {
  noteTitle: string;
  isDeleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeleteNoteDialog = ({
  noteTitle,
  isDeleting,
  error,
  onCancel,
  onConfirm,
}: DeleteNoteDialogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const displayTitle = noteTitle || "Untitled note";

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    if (!isDeleting) onCancel();
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement;
    if (!dialog) return;

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    cancelButtonRef.current?.focus();

    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-note-card border border-accent bg-canvas p-0 text-(--color-ink) shadow-note-card backdrop:bg-(--color-overlay)"
      aria-labelledby="delete-note-title"
      aria-describedby="delete-note-description"
      aria-busy={isDeleting}
      onCancel={handleCancel}
    >
      <div className="min-w-0 p-6">
        <h2 id="delete-note-title" className="text-2xl">
          Delete note?
        </h2>
        <p
          id="delete-note-description"
          className="mt-3 min-w-0 [overflow-wrap:anywhere]"
        >
          Are you sure you want to delete “{displayTitle}”? This can’t be
          undone.
        </p>
        {error ? (
          <p className="mt-3 text-sm text-(--color-danger)" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <Button
            ref={cancelButtonRef}
            variant="secondary"
            disabled={isDeleting}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button variant="danger" disabled={isDeleting} onClick={onConfirm}>
            {isDeleting ? "Deleting…" : "Delete note"}
          </Button>
        </div>
      </div>
    </dialog>
  );
};
