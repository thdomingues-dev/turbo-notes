import type { components } from "@/shared/api/generated/schema";

type ApiCategoryKey = components["schemas"]["CategoryKeyEnum"];

export const CATEGORIES = [
  {
    key: "random-thoughts",
    name: "Random Thoughts",
  },
  {
    key: "school",
    name: "School",
  },
  {
    key: "personal",
    name: "Personal",
  },
  {
    key: "drama",
    name: "Drama",
  },
] as const satisfies readonly { key: ApiCategoryKey; name: string }[];

export type CategoryKey = (typeof CATEGORIES)[number]["key"];
export type CategoryFilterKey = "all" | CategoryKey;

type Assert<T extends true> = T;
type CategoryContractMatchesApi = Assert<
  [ApiCategoryKey] extends [CategoryKey]
    ? [CategoryKey] extends [ApiCategoryKey]
      ? true
      : false
    : false
>;

const categoryContractMatchesApi: CategoryContractMatchesApi = true;
void categoryContractMatchesApi;

export interface CategoryDefinition {
  key: CategoryKey;
  name: string;
}

export interface CategoryWithCount extends CategoryDefinition {
  noteCount: number | null;
}

export const CATEGORY_KEYS = CATEGORIES.map(
  ({ key }) => key,
) as readonly CategoryKey[];

export const CATEGORY_DEFINITIONS = Object.fromEntries(
  CATEGORIES.map((category) => [category.key, category]),
) as Record<CategoryKey, CategoryDefinition>;

export const EDITOR_CATEGORIES: readonly CategoryDefinition[] = [
  CATEGORY_DEFINITIONS["random-thoughts"],
  CATEGORY_DEFINITIONS.personal,
  CATEGORY_DEFINITIONS.school,
  CATEGORY_DEFINITIONS.drama,
];

export const DEFAULT_CATEGORY_KEY: CategoryKey = "random-thoughts";

export function isCategoryKey(
  value: string | null | undefined,
): value is CategoryKey {
  return CATEGORY_KEYS.some((key) => key === value);
}

export function isCategoryFilterKey(
  value: string | null | undefined,
): value is CategoryFilterKey {
  return value === "all" || isCategoryKey(value);
}
