import type { Ref } from "react";

import { cn } from "@/shared/lib/classNames";
import { Button } from "@/shared/ui/Button";

interface NewNoteButtonProps {
  isCreating: boolean;
  disabled: boolean;
  onClick: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}

export const NewNoteButton = ({
  isCreating,
  disabled,
  onClick,
  buttonRef,
}: NewNoteButtonProps) => {
  return (
    <Button
      ref={buttonRef}
      className={cn(
        "min-w-31.5 gap-1.5 px-0 text-base leading-none font-bold lg:relative lg:h-new-note-height lg:min-h-new-note-height lg:w-new-note-width lg:before:absolute lg:before:inset-x-0 lg:before:-inset-y-px lg:before:content-['']",
        isCreating && "disabled:cursor-wait",
      )}
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      <PlusIcon />
      {isCreating ? "Creating…" : "New Note"}
    </Button>
  );
};

const PlusIcon = () => {
  return (
    <svg
      className="size-4 shrink-0 fill-none stroke-current stroke-[1.5] [stroke-linecap:round]"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path d="M8 3.25v9.5M3.25 8h9.5" />
    </svg>
  );
};
