"use client";

import { useState } from "react";
import { formatILS } from "@/lib/money";
import type { MonthPoint } from "@/lib/stats";
import { Legend } from "./Legend";
import { shortILS, type SeriesMember } from "./series";

const MONTHS = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];

// Stacked columns, one per month, oldest on the right (reading direction in Hebrew).
// Tap a column for its exact figures. The selected month is marked under its label.
export function TrendColumns({ data, series, current }: { data: MonthPoint[]; series: SeriesMember[]; current: string }) {
  const [active, setActive] = useState(current);
  const max = Math.max(...data.map((p) => p.total), 0);
  const top = niceCeil(max);
  const ticks = [top, top / 2, 0];
  const point = data.find((p) => p.month === active) ?? data.at(-1)!;
  const H = 140;

  return (
    <div className="space-y-3">
      <Legend series={series} />

      <div className="rounded-xl bg-background p-3 text-sm" aria-live="polite">
        <p className="font-semibold">
          {MONTHS.at(Number(point.month.slice(5)) - 1)} {point.month.slice(0, 4)} ·{" "}
          <bdi dir="ltr">{formatILS(point.total)}</bdi>
        </p>
        <p className="mt-0.5 flex gap-4 text-xs text-muted">
          {series.map((m) => (
            <span key={m.id}>
              {m.name}: <bdi dir="ltr">{formatILS(point.byMember[m.id] ?? 0)}</bdi>
            </span>
          ))}
        </p>
      </div>

      <div className="flex gap-2">
        {/* y-axis labels (recessive) */}
        <div className="flex shrink-0 flex-col justify-between text-[10px] text-muted" style={{ height: H }}>
          {ticks.map((t) => (
            <span key={t} dir="ltr">
              {shortILS(t)}
            </span>
          ))}
        </div>

        <div className="relative flex-1">
          {/* gridlines */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height: H }}>
            {ticks.map((t) => (
              <div key={t} className="border-t border-grid" />
            ))}
          </div>

          <ul className="relative flex items-end justify-between gap-2" style={{ height: H }}>
            {data.map((p) => {
              const isActive = p.month === active;
              return (
                <li key={p.month} className="flex h-full flex-1 items-end justify-center">
                  {/* hit target is the whole column height, wider than the bar */}
                  <button
                    type="button"
                    onClick={() => setActive(p.month)}
                    aria-label={`${p.month}: ${formatILS(p.total)}`}
                    aria-pressed={isActive}
                    className="flex h-full w-full items-end justify-center"
                  >
                    <span
                      className="flex w-full max-w-7 flex-col-reverse gap-[2px]"
                      style={{ height: top ? `${(p.total / top) * 100}%` : 0, opacity: isActive ? 1 : 0.55 }}
                    >
                      {series.map((m, i) => {
                        const v = Math.max(0, p.byMember[m.id] ?? 0);
                        if (v === 0) return null;
                        const isTop = series.slice(i + 1).every((n) => (p.byMember[n.id] ?? 0) <= 0);
                        return (
                          <span
                            key={m.id}
                            className="block w-full"
                            style={{
                              flexGrow: v,
                              background: m.color,
                              borderTopLeftRadius: isTop ? 4 : 0,
                              borderTopRightRadius: isTop ? 4 : 0,
                            }}
                          />
                        );
                      })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <ul className="mt-1 flex justify-between gap-2 text-center text-[11px] text-muted">
            {data.map((p) => (
              <li key={p.month} className={`flex-1 ${p.month === active ? "font-semibold text-foreground" : ""}`}>
                {MONTHS.at(Number(p.month.slice(5)) - 1)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Round the axis top up to 1, 2 or 5 × a power of ten. */
function niceCeil(v: number): number {
  if (v <= 0) return 0;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
