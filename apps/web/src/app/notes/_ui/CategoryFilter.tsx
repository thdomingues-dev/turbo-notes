import { cva } from "class-variance-authority";

import {
  CategoryMarker,
  categoryCssVariables,
  type CategoryFilterKey,
  type CategoryWithCount,
} from "@/entities/note";
import { cn } from "@/shared/lib/classNames";
import { Button } from "@/shared/ui/Button";

const categoryFilterButtonStyles = cva(
  "min-h-11 flex-none justify-start border-transparent text-sm whitespace-nowrap aria-pressed:border-accent aria-pressed:bg-accent/9 sm:w-full sm:rounded-[4px] sm:border-0 sm:text-left sm:aria-pressed:font-bold lg:h-8 lg:min-h-8 lg:text-card-copy lg:leading-none lg:text-note-ink lg:aria-pressed:bg-transparent",
  {
    variants: {
      kind: {
        all: "px-3.5 font-bold sm:px-2.5 lg:px-4",
        category:
          "grid grid-cols-[12px_auto_auto] items-center gap-2 px-3 sm:grid-cols-[12px_minmax(0,1fr)_auto] sm:gap-1.5 sm:px-2.5 lg:grid-cols-[12px_1fr_auto] lg:gap-2 lg:px-4",
      },
    },
  },
);

interface CategoryFilterProps {
  categories: CategoryWithCount[];
  value: CategoryFilterKey;
  onChange: (category: CategoryFilterKey) => void;
  className?: string;
}

export const CategoryFilter = ({
  categories,
  value,
  onChange,
  className,
}: CategoryFilterProps) => {
  const categoryCountLabel = (category: CategoryWithCount) => {
    if (category.noteCount === null) return category.name;
    return `${category.name}, ${category.noteCount} ${category.noteCount === 1 ? "note" : "notes"}`;
  };

  return (
    <nav
      className={cn(
        "flex min-w-0 scrollbar-none items-center gap-2 overflow-x-auto overscroll-x-contain sm:block sm:w-full sm:overflow-visible lg:flex lg:w-sidebar-width lg:flex-col lg:items-stretch lg:gap-0 [&::-webkit-scrollbar]:hidden",
        className,
      )}
      aria-label="Note categories"
    >
      <Button
        className={categoryFilterButtonStyles({ kind: "all" })}
        variant="secondary"
        type="button"
        aria-pressed={value === "all"}
        onClick={() => onChange("all")}
      >
        <span>All Categories</span>
      </Button>
      <div className="flex flex-none gap-2 sm:grid sm:gap-0 lg:w-full">
        {categories.map((category) => (
          <Button
            className={categoryFilterButtonStyles({ kind: "category" })}
            variant="secondary"
            style={categoryCssVariables(category)}
            type="button"
            aria-pressed={value === category.key}
            aria-label={categoryCountLabel(category)}
            key={category.key}
            onClick={() => onChange(category.key)}
          >
            <CategoryMarker />
            <span>{category.name}</span>
            {category.noteCount === null ? (
              <span className="tabular-nums" aria-hidden="true">
                —
              </span>
            ) : category.noteCount > 0 ? (
              <span className="tabular-nums" aria-hidden="true">
                {category.noteCount}
              </span>
            ) : null}
          </Button>
        ))}
      </div>
    </nav>
  );
};
