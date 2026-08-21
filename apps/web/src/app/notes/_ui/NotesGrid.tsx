import type { CategoryFilterKey, NoteListItem } from "@/entities/note";
import { ErrorState, LoadingState } from "@/shared/ui/AsyncState";
import { Button } from "@/shared/ui/Button";
import type { useNotesIndex } from "../_model/useNotesIndex";
import { EmptyState } from "./EmptyState";
import { NoteCard } from "./NoteCard";

interface NotesGridProps {
  category: CategoryFilterKey;
  state: ReturnType<typeof useNotesIndex>;
  onRequestDelete: (note: NoteListItem) => void;
}

export const NotesGrid = ({
  category,
  state,
  onRequestDelete,
}: NotesGridProps) => {
  return (
    <section className="min-w-0" aria-label="Notes">
      {state.status === "loading" ? (
        <LoadingState label="Loading notes" />
      ) : null}
      {state.status === "error" && state.error ? (
        <ErrorState
          title="We couldn’t load your notes."
          error={state.error}
          onRetry={state.retry}
          headingLevel="h2"
        />
      ) : null}
      {state.status === "success" && state.notes.length === 0 ? (
        <EmptyState />
      ) : null}
      {state.status === "success" && state.notes.length > 0 ? (
        <>
          <div
            className="grid grid-cols-[minmax(0,1fr)] gap-x-notes-grid-gap gap-y-4 sm:grid-cols-2 lg:grid-cols-3"
            data-notes-grid
          >
            {state.notes.map((note) => (
              <NoteCard
                note={note}
                returnCategory={category}
                onRequestDelete={onRequestDelete}
                key={note.id}
              />
            ))}
          </div>
          {state.loadMoreError ? (
            <p className="mt-5 text-center text-(--color-danger)" role="alert">
              {state.loadMoreError.message}
            </p>
          ) : null}
          {state.next ? (
            <Button
              className="mx-auto mt-7 block"
              disabled={state.isLoadingMore}
              onClick={() => void state.loadMore()}
            >
              {state.isLoadingMore ? "Loading…" : "Load more notes"}
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
};
