import type { CSSProperties } from "react";

import type { CategoryDefinition } from "../model/categories";

export const categoryNoteSurfaceStyles =
  "rounded-note-card bg-[color-mix(in_srgb,var(--category-color)_50%,transparent)] shadow-note-card [border:var(--spacing-note-card-border)_solid_var(--category-color)]";

export function categoryCssVariables(category: CategoryDefinition) {
  return {
    "--category-color": `var(--color-${category.key})`,
  } as CSSProperties;
}
