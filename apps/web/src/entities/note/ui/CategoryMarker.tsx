import { cn } from "@/shared/lib/classNames";

interface CategoryMarkerProps {
  className?: string;
}

export const CategoryMarker = ({ className }: CategoryMarkerProps) => {
  return (
    <span
      className={cn("size-3 rounded-full bg-(--category-color)", className)}
      aria-hidden="true"
    />
  );
};
