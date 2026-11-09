import { formatILS } from "@/lib/money";
import type { BudgetLine, Level } from "@/lib/budget";

const LEVEL: Record<Level, { color: string; icon: string; word: string }> = {
  ok: { color: "var(--accent)", icon: "", word: "" },
  warning: { color: "var(--status-warning)", icon: "⚠", word: "קרוב לתקרה" },
  over: { color: "var(--status-critical)", icon: "⛔", word: "חריגה" },
};

// Progress toward a budget. The level is never color alone: an icon and a word go with it.
export function BudgetBar({ line, pace }: { line: BudgetLine; pace?: boolean }) {
  const lv = LEVEL[line.level];
  const width = Math.min(line.percent, 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{line.label}</span>
        <span className="text-muted">
          <bdi dir="ltr" className="font-semibold text-foreground">{formatILS(line.spent)}</bdi>
          {" מתוך "}
          <bdi dir="ltr">{formatILS(line.budget)}</bdi>
        </span>
      </div>

      <div
        className="h-2.5 overflow-hidden rounded-full bg-grid"
        role="progressbar"
        aria-valuenow={line.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${line.label}: ${line.percent}%`}
      >
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: lv.color }} />
      </div>

      <div className="flex justify-between text-xs">
        <span className="text-muted">
          {line.remaining >= 0 ? (
            <>
              נשארו <bdi dir="ltr">{formatILS(line.remaining)}</bdi>
            </>
          ) : (
            <>
              חריגה של <bdi dir="ltr">{formatILS(-line.remaining)}</bdi>
            </>
          )}
          {" · "}
          {line.percent}%
        </span>
        {line.level !== "ok" ? (
          <span className="font-semibold text-foreground">
            <span aria-hidden>{lv.icon}</span> {lv.word}
          </span>
        ) : (
          pace && <span className="text-muted">בקצב מהיר מהחודש</span>
        )}
      </div>
    </div>
  );
}
