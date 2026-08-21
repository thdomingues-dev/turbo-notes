"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

import {
  categoryCssVariables,
  categoryNoteSurfaceStyles,
  formatLastEdited,
  NOTE_CONTENT_MAX_LENGTH,
  NOTE_TITLE_MAX_LENGTH,
  type CategoryKey,
  type NoteDetail,
} from "@/entities/note";
import { SessionRefreshWarning } from "@/features/auth";
import type { SaveState } from "@/features/note-autosave";
import { cn } from "@/shared/lib/classNames";
import { Button, IconButton } from "@/shared/ui/Button";
import { CategorySelect } from "./CategorySelect";
import { SaveStatus } from "./SaveStatus";

interface NoteEditorViewProps {
  draft: NoteDetail;
  saveState: SaveState;
  saveError: string | null;
  isClosing: boolean;
  isReloading: boolean;
  sessionRefreshFailed: boolean;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
  onCategoryChange: (category: CategoryKey) => void;
  onSave: () => Promise<boolean>;
  onClose: () => Promise<void>;
  onRetry: () => Promise<boolean>;
  onReloadLatest: () => Promise<boolean>;
  onRetrySession: () => void;
}

export const NoteEditorView = ({
  draft,
  saveState,
  saveError,
  isClosing,
  isReloading,
  sessionRefreshFailed,
  onTitleChange,
  onContentChange,
  onCategoryChange,
  onSave,
  onClose,
  onRetry,
  onReloadLatest,
  onRetrySession,
}: NoteEditorViewProps) => {
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const isEditorDisabled = isClosing || isReloading;

  const handleResizeTitle = useCallback(() => {
    const title = titleRef.current;
    if (!title) return;
    title.style.height = "auto";
    title.style.height = `${title.scrollHeight}px`;
  }, []);

  useLayoutEffect(() => {
    handleResizeTitle();
    window.addEventListener("resize", handleResizeTitle);
    return () => window.removeEventListener("resize", handleResizeTitle);
  }, [draft.title, handleResizeTitle]);

  return (
    <main
      className="mx-auto min-h-dvh w-full px-3 pt-[max(12px,env(safe-area-inset-top))] pb-[max(12px,env(safe-area-inset-bottom))] md:max-w-7xl md:pt-8.75 md:pr-11 md:pb-12 md:pl-9.25"
      style={categoryCssVariables(draft.category)}
    >
      <h1 className="sr-only">Edit note</h1>
      <header className="sticky top-0 z-20 flex min-w-0 items-center justify-between gap-2 bg-canvas pb-2.5 md:static md:h-9.75 md:items-start md:p-0">
        <CategorySelect
          value={draft.category.key}
          onChange={onCategoryChange}
          disabled={isEditorDisabled}
        />
        <div className="flex min-w-0 items-center gap-0.5">
          <SaveStatus state={saveState} />
          <IconButton
            className="flex-none disabled:cursor-wait disabled:opacity-50 md:relative md:size-6 md:after:absolute md:after:-inset-2.5 md:after:content-['']"
            variant="text"
            aria-label="Close note"
            disabled={isEditorDisabled}
            onClick={() => void onClose()}
          >
            <CloseIcon />
          </IconButton>
        </div>
      </header>

      {sessionRefreshFailed ? (
        <div className="mb-2">
          <SessionRefreshWarning onRetry={onRetrySession} />
        </div>
      ) : null}

      {saveError ? (
        <div
          className="mb-2 flex min-h-11 items-center justify-between gap-3 rounded-control border border-(--color-danger) bg-(--color-danger-surface) px-3 py-2 text-sm text-(--color-danger) md:fixed md:top-19.5 md:left-1/2 md:z-30 md:m-0 md:w-[min(640px,calc(100vw-32px))] md:-translate-x-1/2 md:shadow-(--shadow-save-error)"
          role="alert"
        >
          <p>{saveError}</p>
          {saveState === "conflict" ? (
            <Button
              className="min-h-9 flex-none px-0 font-bold text-inherit"
              variant="text"
              size="sm"
              onClick={() => {
                const shouldReload = window.confirm(
                  "Reload the server version? Your current local draft will be replaced.",
                );
                if (shouldReload) void onReloadLatest();
              }}
            >
              Reload server version
            </Button>
          ) : (
            <Button
              className="min-h-9 flex-none px-0 font-bold text-inherit"
              variant="text"
              size="sm"
              onClick={() => void onRetry()}
            >
              Retry save
            </Button>
          )}
        </div>
      ) : null}

      <section
        className={cn(
          categoryNoteSurfaceStyles,
          "flex min-h-[calc(100dvh-80px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col overflow-hidden px-5 pt-4.5 pb-3 md:mt-2.5 md:min-h-[calc(100dvh-132px)] md:gap-6 md:pt-9.75 md:pr-16 md:pb-16 md:pl-16",
        )}
        aria-label="Note editor"
      >
        <p className="self-end text-right text-card-copy leading-[1.4] text-note-ink md:h-3.75 md:w-265 md:max-w-full md:flex-none md:leading-3">
          Last Edited:{" "}
          <time dateTime={draft.lastEditedAt}>
            {formatLastEdited(draft.lastEditedAt)}
          </time>
        </p>
        <label className="sr-only" htmlFor="note-title">
          Note title
        </label>
        <textarea
          className="mt-5 w-full resize-none overflow-hidden border-0 bg-transparent p-0 font-serif text-[clamp(1.6rem,8vw,2rem)] font-bold text-(--color-ink) outline-none placeholder:text-(--color-ink-placeholder) placeholder:opacity-100 md:mt-0 md:min-h-note-title-min-height md:w-[calc(100%+1px)] md:flex-none md:text-[24px] md:leading-6 md:text-note-ink md:placeholder:text-note-ink"
          id="note-title"
          ref={titleRef}
          value={draft.title}
          maxLength={NOTE_TITLE_MAX_LENGTH}
          rows={1}
          placeholder="Note Title"
          disabled={isEditorDisabled}
          onChange={(event) => onTitleChange(event.target.value)}
          onBlur={() => void onSave()}
        />
        <label className="sr-only" htmlFor="note-content">
          Note content
        </label>
        <textarea
          className="mt-4 min-h-0 w-full flex-1 resize-none border-0 bg-transparent p-0 font-[inherit] text-base leading-[1.55] text-(--color-ink) outline-none placeholder:text-(--color-ink-placeholder) placeholder:opacity-100 md:mt-0 md:w-[calc(100%+1px)] md:leading-6.75 md:text-note-ink md:placeholder:text-note-ink"
          id="note-content"
          value={draft.content}
          maxLength={NOTE_CONTENT_MAX_LENGTH}
          placeholder="Pour your heart out…"
          disabled={isEditorDisabled}
          spellCheck
          onChange={(event) => onContentChange(event.target.value)}
          onBlur={() => void onSave()}
        />
      </section>
    </main>
  );
};

const CloseIcon = () => {
  return (
    <svg
      className="size-6 fill-none stroke-current stroke-[1.4] text-accent [stroke-linecap:round]"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M2 2 22 22M22 2 2 22" />
    </svg>
  );
};
