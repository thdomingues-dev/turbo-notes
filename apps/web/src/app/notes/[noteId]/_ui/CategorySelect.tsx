"use client";

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

import {
  CATEGORY_DEFINITIONS,
  CategoryMarker,
  EDITOR_CATEGORIES,
  categoryCssVariables,
  type CategoryKey,
} from "@/entities/note";
import { Button } from "@/shared/ui/Button";

interface CategorySelectProps {
  value: CategoryKey;
  onChange: (value: CategoryKey) => void;
  disabled?: boolean;
}

export const CategorySelect = ({
  value,
  onChange,
  disabled = false,
}: CategorySelectProps) => {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const selected = CATEGORY_DEFINITIONS[value];

  const handleListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>(
        "[role='menuitem']",
      ) ?? [],
    );
    const activeIndex = items.indexOf(
      document.activeElement as HTMLButtonElement,
    );

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (event.key === "Tab") {
      setOpen(false);
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
      return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (activeIndex + delta + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const firstItem =
      listRef.current?.querySelector<HTMLElement>("[role='menuitem']");
    firstItem?.focus();
  }, [open]);

  return (
    <div
      className="relative z-20 min-w-0 flex-1 sm:flex-none"
      ref={rootRef}
      style={categoryCssVariables(selected)}
    >
      <Button
        className="grid min-h-11 w-full min-w-0 grid-cols-[12px_minmax(0,1fr)_20px] items-center gap-2 rounded-[4px] px-3 text-left text-sm disabled:opacity-65 sm:h-9.75 sm:min-h-9.75 sm:w-56.25 sm:rounded-control sm:px-3.75 sm:py-1.75 sm:text-card-copy sm:leading-3 sm:text-note-ink"
        variant="secondary"
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <CategoryMarker />
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">
          {selected.name}
        </span>
        <ChevronIcon />
      </Button>

      {open ? (
        <>
          <button
            className="fixed inset-0 z-1 cursor-pointer border-0 bg-(--color-overlay) sm:hidden"
            type="button"
            aria-label="Close category options"
            onClick={() => setOpen(false)}
          />
          <ul
            className="fixed right-0 bottom-0 left-0 z-2 m-0 grid max-h-[calc(100dvh-env(safe-area-inset-top)-24px)] list-none gap-1 overflow-y-auto rounded-t-[18px] border border-accent bg-canvas px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-(--shadow-category-menu-mobile) sm:absolute sm:top-[calc(100%+7px)] sm:right-auto sm:bottom-auto sm:left-0 sm:w-56.25 sm:gap-0 sm:overflow-hidden sm:rounded-[8px] sm:border-0 sm:p-0 sm:shadow-none"
            id={menuId}
            role="menu"
            aria-label="Change note category"
            ref={listRef}
            onKeyDown={handleListKeyDown}
          >
            {EDITOR_CATEGORIES.filter((category) => category.key !== value).map(
              (category) => (
                <li role="none" key={category.key}>
                  <Button
                    className="grid min-h-13 w-full grid-cols-[12px_1fr] items-center gap-2 rounded-[8px] border-0 px-3 text-left sm:h-8 sm:min-h-8 sm:rounded-none sm:px-4 sm:text-card-copy sm:leading-3 sm:text-note-ink"
                    variant="secondary"
                    role="menuitem"
                    type="button"
                    style={categoryCssVariables(category)}
                    disabled={disabled}
                    onClick={() => {
                      onChange(category.key);
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                  >
                    <CategoryMarker />
                    <span>{category.name}</span>
                  </Button>
                </li>
              ),
            )}
          </ul>
        </>
      ) : null}
    </div>
  );
};

const ChevronIcon = () => {
  return (
    <svg
      className="h-2.5 w-5 fill-none stroke-current stroke-[1.5] text-accent [stroke-linecap:round] [stroke-linejoin:round]"
      viewBox="0 0 20 10"
      aria-hidden="true"
    >
      <path d="M.75.75 10 9.25 19.25.75" />
    </svg>
  );
};
