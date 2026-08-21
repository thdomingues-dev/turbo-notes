import { cva } from "class-variance-authority";

import type { SaveState } from "@/features/note-autosave";

const saveStatusStyles = cva(
  "inline-flex min-h-6 min-w-22 items-center gap-1.5 text-xs whitespace-nowrap",
  {
    variants: {
      state: {
        saved: "text-(--color-success)",
        dirty: "text-accessible-link",
        saving: "text-(--color-ink-muted)",
        error: "text-(--color-danger)",
        conflict: "text-(--color-danger)",
      },
    },
  },
);

const saveIndicatorStyles = cva("size-1.75 rounded-full bg-current", {
  variants: {
    animated: {
      true: "animate-saving-pulse motion-reduce:animate-none",
      false: null,
    },
  },
});

interface SaveStatusProps {
  state: SaveState;
}

const LABELS: Record<SaveState, string> = {
  saved: "Saved",
  dirty: "Unsaved",
  saving: "Saving…",
  error: "Not saved",
  conflict: "Save conflict",
};

export const SaveStatus = ({ state }: SaveStatusProps) => {
  return (
    <span
      className={saveStatusStyles({ state })}
      data-state={state}
      role="status"
      aria-live="polite"
    >
      <span
        className={saveIndicatorStyles({ animated: state === "saving" })}
        aria-hidden="true"
      />
      {LABELS[state]}
    </span>
  );
};
