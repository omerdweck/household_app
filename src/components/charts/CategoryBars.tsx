"use client";

import { useState } from "react";
import { formatILS } from "@/lib/money";
import type { CategoryTotal } from "@/lib/stats";
import { Legend } from "./Legend";
import type { SeriesMember } from "./series";

// Ranked horizontal bars, largest first, all on one baseline (the right edge, for RTL).
// Each bar is stacked by who carries it. The name and total are always printed;
// tapping a row shows the split per person (the touch version of a hover tooltip).
export function CategoryBars({ data, series }: { data: CategoryTotal[]; series: SeriesMember[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(...data.map((c) => c.total), 0);
  if (max <= 0) return <p className="text-sm text-muted">אין הוצאות בחודש הזה.</p>;

  return (
    <div className="space-y-3">
      <Legend series={series} />
      <ul className="space-y-1">
        {data.map((c) => {
          const key = c.id ?? c.name;
          const isOpen = open === key;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : key)}
                aria-expanded={isOpen}
                className="w-full rounded-lg px-1 py-1.5 text-start active:bg-surface"
              >
                <div className="mb-1 flex justify-between text-sm">
                  <span>{c.name}</span>
                  <bdi dir="ltr" className="font-semibold">
                    {formatILS(c.total)}
                  </bdi>
                </div>
                <div className="flex h-3 gap-[2px]" style={{ width: `${Math.max((c.total / max) * 100, 1.5)}%` }}>
                  {series.map((m, i) => {
                    const v = Math.max(0, c.byMember[m.id] ?? 0);
                    if (v === 0) return null;
                    const last = series.slice(i + 1).every((n) => (c.byMember[n.id] ?? 0) <= 0);
                    const first = series.slice(0, i).every((n) => (c.byMember[n.id] ?? 0) <= 0);
                    return (
                      <span
                        key={m.id}
                        className="block h-full"
                        style={{
                          flexGrow: v,
                          background: m.color,
                          // round only the free end of the bar; the baseline end stays square
                          borderStartStartRadius: first ? 0 : undefined,
                          borderEndStartRadius: first ? 0 : undefined,
                          borderStartEndRadius: last ? 4 : 0,
                          borderEndEndRadius: last ? 4 : 0,
                        }}
                      />
                    );
                  })}
                </div>
                {isOpen && (
                  <div className="mt-1.5 flex gap-4 text-xs text-muted">
                    {series.map((m) => (
                      <span key={m.id}>
                        {m.name}: <bdi dir="ltr">{formatILS(c.byMember[m.id] ?? 0)}</bdi>
                      </span>
                    ))}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
