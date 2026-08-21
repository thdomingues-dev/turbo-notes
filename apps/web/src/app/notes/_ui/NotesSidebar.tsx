import {
  type CategoryFilterKey,
  type CategoryWithCount,
} from "@/entities/note";
import { Button } from "@/shared/ui/Button";
import { CategoryFilter } from "./CategoryFilter";

interface NotesSidebarProps {
  categories: CategoryWithCount[];
  category: CategoryFilterKey;
  isLoggingOut: boolean;
  logoutError: string | null;
  onCategoryChange: (category: CategoryFilterKey) => void;
  onLogout: () => void;
}

export const NotesSidebar = ({
  categories,
  category,
  isLoggingOut,
  logoutError,
  onCategoryChange,
  onLogout,
}: NotesSidebarProps) => {
  return (
    <aside className="flex min-w-0 items-center gap-2 sm:w-42 sm:flex-col sm:items-stretch sm:gap-3 lg:w-sidebar-width">
      <CategoryFilter
        className="flex-1 sm:flex-none"
        categories={categories}
        value={category}
        onChange={onCategoryChange}
      />
      <Button
        className="min-h-11 min-w-17 flex-none px-0 text-card-copy disabled:cursor-wait disabled:opacity-65 sm:w-max sm:px-2.5 sm:text-left lg:-my-1.5 lg:h-11 lg:w-full lg:justify-start lg:px-4 lg:leading-none"
        variant="text"
        disabled={isLoggingOut}
        onClick={onLogout}
      >
        {isLoggingOut ? "Logging out…" : "Log out"}
      </Button>
      {logoutError ? (
        <p className="text-card-copy text-(--color-danger)" role="alert">
          {logoutError}
        </p>
      ) : null}
    </aside>
  );
};
