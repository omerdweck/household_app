"use client";

import { useState, useTransition } from "react";
import { formatILS } from "@/lib/money";
import { guessKind, type CycleStatus, type RecurringItem, type Suggestion } from "@/lib/recurring";
import { confirmSuggestion, dismissSuggestion, stopTracking } from "./actions";
import { FixedCostForm, KIND_LABEL, PERIOD_LABEL } from "./FixedCostForm";

const dm = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

// ---------- suggestion ----------

export function SuggestionCard({ s }: { s: Suggestion }) {
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;

  const input = {
    merchantKey: s.merchantKey,
    label: s.label,
    amount: s.typicalAmount,
    day: s.dayOfMonth,
    period: s.periodMonths,
    kind: guessKind(s),
    tag: s.tag,
    categoryId: s.categoryId,
  };

  return (
    <li className="rounded-2xl border border-dashed border-accent p-4">
      <p className="font-semibold">{s.label}</p>
      <p className="mt-0.5 text-sm text-muted">
        בסביבות <bdi dir="ltr">{formatILS(s.typicalAmount)}</bdi> · {PERIOD_LABEL[s.periodMonths]} · בסביבות ה-{s.dayOfMonth}
        {" · "}נמצא {s.occurrences} פעמים
      </p>
      <div className="mt-3 flex gap-2">
        <button
          disabled={pending}
          onClick={() => start(async () => { if (!(await confirmSuggestion(input)).error) setGone(true); })}
          className="flex-1 rounded-xl bg-accent py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60"
        >
          הוספה לחשבונות הקבועים
        </button>
        <button
          disabled={pending}
          onClick={() => start(async () => { if (!(await dismissSuggestion(input)).error) setGone(true); })}
          className="rounded-xl border border-border px-4 text-sm"
        >
          התעלמות
        </button>
      </div>
    </li>
  );
}

// ---------- confirmed fixed cost ----------

const STATUS: Record<CycleStatus["state"], { icon: string; color: string }> = {
  paid: { icon: "✓", color: "var(--status-good)" },
  upcoming: { icon: "⏳", color: "var(--muted)" },
  due: { icon: "⏰", color: "var(--status-warning)" },
  missing: { icon: "⚠", color: "var(--status-critical)" },
};

function statusText(st: CycleStatus): string {
  switch (st.state) {
    case "paid":
      return `שולם ${dm(st.date)}`;
    case "upcoming":
      return `צפוי ב-${dm(st.due)}`;
    case "due":
      return `היה צפוי ב-${dm(st.due)}`;
    case "missing":
      return `לא נמצא תשלום (צפוי ${dm(st.due)})`;
  }
}

export function FixedCostCard({
  item,
  status,
  history,
}: {
  item: RecurringItem & { category_id: string | null };
  status: CycleStatus;
  history: { date: string; amount: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const st = STATUS[status.state];
  const shown = history.slice(0, 8);
  const max = Math.max(...shown.map((h) => h.amount), 1);
  const change =
    history.length >= 2 && history[1].amount > 0
      ? Math.round(((history[0].amount - history[1].amount) / history[1].amount) * 100)
      : null;

  return (
    <li className="rounded-2xl border border-border bg-surface">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full p-4 text-start">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{item.label}</p>
            <p className="text-xs text-muted">
              {KIND_LABEL[item.kind]} · {PERIOD_LABEL[item.period_months] ?? ""}
              {item.day_of_month ? ` · ב-${item.day_of_month} לחודש` : ""}
            </p>
          </div>
          <bdi dir="ltr" className="shrink-0 font-semibold">
            {item.expected_amount !== null ? formatILS(status.state === "paid" ? status.amount : item.expected_amount) : "—"}
          </bdi>
        </div>
        <p className="mt-2 text-sm">
          <span aria-hidden style={{ color: st.color }} className="font-bold">
            {st.icon}
          </span>{" "}
          {statusText(status)}
        </p>
      </button>

      {open && (
        <div className="space-y-4 border-t border-border p-4">
          {shown.length > 0 ? (
            <div className="space-y-1">
              <p className="text-sm font-semibold">
                תשלומים אחרונים
                {change !== null && change !== 0 && (
                  <span className="ms-2 text-xs font-normal text-muted">
                    {change > 0 ? "▲" : "▼"} {Math.abs(change)}% מהקודם
                  </span>
                )}
              </p>
              <ul className="space-y-1">
                {shown.map((h) => (
                  <li key={h.date} className="flex items-center gap-2 text-xs">
                    <span className="w-12 shrink-0 text-muted" dir="ltr">
                      {dm(h.date)}/{h.date.slice(2, 4)}
                    </span>
                    <span className="h-2 rounded-e-full bg-accent/70" style={{ width: `${(h.amount / max) * 60}%` }} />
                    <bdi dir="ltr" className="shrink-0">
                      {formatILS(h.amount)}
                    </bdi>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted">עוד לא נמצאו תשלומים.</p>
          )}

          {editing ? (
            <FixedCostForm
              submitLabel="שמירה"
              onDone={() => setEditing(false)}
              defaults={{
                merchantKey: item.merchant_pattern,
                label: item.label,
                amount: item.expected_amount,
                day: item.day_of_month,
                period: item.period_months,
                kind: item.kind,
                tag: item.tag,
                categoryId: item.category_id,
              }}
            />
          ) : (
            <div className="flex gap-4 text-sm">
              <button type="button" onClick={() => setEditing(true)} className="font-semibold text-accent">
                עריכה
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => start(() => stopTracking(item.id))}
                className="text-muted underline"
              >
                הפסקת מעקב
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ---------- manual add ----------

export function AddFixedCost({ merchants }: { merchants: { key: string; label: string }[] }) {
  const [key, setKey] = useState("");
  const chosen = merchants.find((m) => m.key === key);
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <label className="block text-sm">
        <span className="mb-1 block text-muted">הוספה ידנית — בחרו בית עסק מההוצאות האחרונות</span>
        <select value={key} onChange={(e) => setKey(e.target.value)} className="input">
          <option value="">בחירה…</option>
          {merchants.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {chosen && (
        <FixedCostForm
          key={chosen.key}
          submitLabel="הוספה"
          onDone={() => setKey("")}
          defaults={{
            merchantKey: chosen.key,
            label: chosen.label,
            amount: null,
            day: null,
            period: 1,
            kind: "bill",
            tag: "apartment",
            categoryId: null,
          }}
        />
      )}
    </div>
  );
}
