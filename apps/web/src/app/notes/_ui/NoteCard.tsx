import Link from "next/link";

import {
  categoryCssVariables,
  categoryNoteSurfaceStyles,
  formatNoteDate,
  noteEditorPath,
  type CategoryFilterKey,
  type NoteListItem,
} from "@/entities/note";
import { cn } from "@/shared/lib/classNames";
import { IconButton } from "@/shared/ui/Button";

interface NoteCardProps {
  note: NoteListItem;
  returnCategory: CategoryFilterKey;
  onRequestDelete: (note: NoteListItem) => void;
}

export const NoteCard = ({
  note,
  returnCategory,
  onRequestDelete,
}: NoteCardProps) => {
  const noteTitle = note.title || "Untitled note";
  const displayTitle = note.title || "Note Title";

  return (
    <article
      className="group relative min-h-55 w-full min-w-0 transition-transform duration-150 hover:-translate-y-px motion-reduce:transition-none sm:min-h-note-card-height lg:h-note-card-height lg:min-h-0"
      style={categoryCssVariables(note.category)}
      data-note-card
    >
      <Link
        className={cn(
          categoryNoteSurfaceStyles,
          "absolute inset-0 block overflow-hidden text-note-ink no-underline transition-shadow duration-150 group-hover:shadow-(--shadow-note-card-hover) motion-reduce:transition-none",
        )}
        href={noteEditorPath(note.id, returnCategory)}
        aria-label={`${noteTitle}, ${note.category.name}, last edited ${formatNoteDate(note.lastEditedAt)}`}
      >
        <div className="flex h-full flex-col gap-3 overflow-hidden p-[calc(var(--spacing-note-card-padding)-var(--spacing-note-card-border))]">
          <div
            className="flex h-3.75 w-note-text-width max-w-full shrink-0 items-baseline gap-2 pr-11 text-card-copy leading-none"
            aria-hidden="true"
          >
            <time className="flex-none font-bold" dateTime={note.lastEditedAt}>
              {formatNoteDate(note.lastEditedAt)}
            </time>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">
              {note.category.name}
            </span>
          </div>
          <h2 className="max-h-note-title-max-height w-note-text-width max-w-full shrink-0 overflow-hidden text-card-title leading-[29px] [overflow-wrap:anywhere] whitespace-pre-wrap">
            {displayTitle}
          </h2>
          <p className="card-copy-clamp h-note-copy-height w-note-text-width max-w-full shrink-0 overflow-hidden text-card-copy leading-none [overflow-wrap:anywhere] whitespace-pre-wrap">
            {note.contentPreview || "Note content..."}
          </p>
        </div>
      </Link>
      <IconButton
        className="absolute top-1 right-1 z-1 text-(--color-danger) transition-opacity duration-150 motion-reduce:transition-none [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
        aria-label={`Delete ${noteTitle}`}
        onClick={() => onRequestDelete(note)}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v5M14 11v5" />
        </svg>
      </IconButton>
    </article>
  );
};
