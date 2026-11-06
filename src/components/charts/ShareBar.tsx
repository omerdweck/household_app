import { formatILS } from "@/lib/money";
import { Legend } from "./Legend";
import type { SeriesMember } from "./series";

// Tall segmented bar: one whole (this month's expenses) split between the two of you,
// each part labeled with its share. Parts are separated by a 2px surface gap.
export function ShareBar({ series, amounts }: { series: SeriesMember[]; amounts: Record<string, number> }) {
  const total = series.reduce((s, m) => s + Math.max(0, amounts[m.id] ?? 0), 0);
  if (total <= 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex h-11 gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label="חלוקת ההוצאות בין בני הזוג">
        {series.map((m) => {
          const v = Math.max(0, amounts[m.id] ?? 0);
          const pct = (v / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={m.id}
              className="flex min-w-0 items-center justify-center text-sm font-semibold text-white"
              style={{ width: `${pct}%`, background: m.color }}
            >
              {pct >= 14 && `${Math.round(pct)}%`}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between gap-2 text-sm">
        {series.map((m) => (
          <p key={m.id}>
            <span className="text-muted">{m.name}: </span>
            <bdi dir="ltr" className="font-semibold">
              {formatILS(amounts[m.id] ?? 0)}
            </bdi>
          </p>
        ))}
      </div>
      <Legend series={series} />
    </div>
  );
}
