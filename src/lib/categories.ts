import type { Category, Tag } from "@/lib/types";

export type CategoryOption = { id: string; label: string; defaultTag: Tag | null };

/** Flatten parent → child into one ordered list: "חשבונות › חשמל". */
export function categoryOptions(categories: Category[]): CategoryOption[] {
  const parents = categories
    .filter((c) => !c.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order);

  return parents.flatMap((p) => {
    const children = categories
      .filter((c) => c.parent_id === p.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    return [
      { id: p.id, label: p.name, defaultTag: p.default_tag },
      ...children.map((c) => ({
        id: c.id,
        label: `${p.name} › ${c.name}`,
        defaultTag: c.default_tag ?? p.default_tag,
      })),
    ];
  });
}
