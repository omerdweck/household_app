// Each household member keeps the same chart color for everyone who looks at it:
// color follows the person, never "me" vs. "you", so both partners see the same chart.
export const SERIES_VARS = ["var(--series-1)", "var(--series-2)"] as const;

export type SeriesMember = { id: string; name: string; color: string };

export function seriesFor(members: { id: string; display_name: string }[], meId: string): SeriesMember[] {
  return members.slice(0, 2).map((m, i) => ({
    id: m.id,
    name: m.id === meId ? `${m.display_name} (אני)` : m.display_name,
    color: SERIES_VARS[i],
  }));
}

const compact = new Intl.NumberFormat("he-IL", { notation: "compact", maximumFractionDigits: 1 });
export const shortILS = (v: number) => `₪${compact.format(v)}`;
