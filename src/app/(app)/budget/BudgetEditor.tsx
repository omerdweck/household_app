"use client";

import { useState, useTransition } from "react";
import type { CategoryOption } from "@/lib/categories";
import { formatILS } from "@/lib/money";
import { saveBudget } from "./actions";

type Target = { memberId: string | null; categoryId: string | null };

export type EditorProps = {
  month: string;
  meId: string;
  shared: number | null;
  mine: number | null;
  partner: { name: string; amount: number | null } | null;
  caps: { categoryId: string; label: string; amount: number }[];
  categories: CategoryOption[]; // parent categories only
};

export function BudgetEditor({ month, meId, shared, mine, partner, caps, categories }: EditorProps) {
  const [newCat, setNewCat] = useState("");
  const capped = new Set(caps.map((c) => c.categoryId));
  const available = categories.filter((c) => !capped.has(c.id));

  return (
    <div className="space-y-4">
      <AmountRow label="קופה משותפת (דירה)" hint="כל ההוצאות שמסומנות דירה, של שניכם" month={month}
        target={{ memberId: null, categoryId: null }} initial={shared} />
      <AmountRow label="התקציב האישי שלי" hint="החלק שלך בהוצאות אישיות ובהוצאות שעוד לא סומנו" month={month}
        target={{ memberId: meId, categoryId: null }} initial={mine} />
      {partner && (
        <div className="flex items-center justify-between text-sm">
          <span>
            התקציב האישי של {partner.name}
            <span className="block text-xs text-muted">רק {partner.name} יכול/ה לשנות</span>
          </span>
          <span dir="ltr" className="font-semibold">
            {partner.amount === null ? "—" : formatILS(partner.amount)}
          </span>
        </div>
      )}

      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-sm font-semibold">תקרה לפי קטגוריה</p>
        {caps.map((c) => (
          <AmountRow key={c.categoryId} label={c.label} month={month}
            target={{ memberId: null, categoryId: c.categoryId }} initial={c.amount} removable />
        ))}

        {available.length > 0 && (
          <div className="space-y-2">
            <select value={newCat} onChange={(e) => setNewCat(e.target.value)} className="input">
              <option value="">+ הוספת תקרה לקטגוריה…</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {newCat && (
              <AmountRow
                key={newCat}
                label={available.find((c) => c.id === newCat)?.label ?? ""}
                month={month}
                target={{ memberId: null, categoryId: newCat }}
                initial={null}
                autoFocus
                onSaved={() => setNewCat("")}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AmountRow({
  label,
  hint,
  month,
  target,
  initial,
  removable,
  autoFocus,
  onSaved,
}: {
  label: string;
  hint?: string;
  month: string;
  target: Target;
  initial: number | null;
  removable?: boolean;
  autoFocus?: boolean;
  onSaved?: () => void;
}) {
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const dirty = value !== (initial === null ? "" : String(initial));

  function save(next: string) {
    setError(null);
    start(async () => {
      const res = await saveBudget(month, target, next);
      if (res.error) setError(res.error);
      else {
        setSaved(true);
        onSaved?.();
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(value);
      }}
      className="space-y-1"
    >
      <div className="flex items-center gap-2">
        <label className="min-w-0 flex-1 text-sm">
          {label}
          {hint && <span className="block text-xs text-muted">{hint}</span>}
        </label>
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          inputMode="decimal"
          placeholder="ללא"
          autoFocus={autoFocus}
          className="input w-28 text-left"
          dir="ltr"
          aria-label={label}
        />
        {dirty ? (
          <button disabled={pending} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60">
            {pending ? "…" : "שמירה"}
          </button>
        ) : removable ? (
          <button
            type="button"
            onClick={() => save("")}
            disabled={pending}
            className="px-2 py-2 text-sm text-muted"
            aria-label={`הסרת התקרה של ${label}`}
          >
            ✕
          </button>
        ) : (
          <span className="w-[52px] text-center text-xs text-muted">{saved ? "נשמר ✓" : ""}</span>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
