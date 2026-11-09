"use client";

import { useActionState, useEffect } from "react";
import type { RecurringItem } from "@/lib/recurring";
import { TAG_LABEL, type Tag } from "@/lib/types";
import { saveItem, type ActionState } from "./actions";

export const KIND_LABEL: Record<RecurringItem["kind"], string> = {
  bill: "חשבון",
  standing_order: "הוראת קבע",
  subscription: "מנוי",
};

export const PERIOD_LABEL: Record<number, string> = {
  1: "כל חודש",
  2: "כל חודשיים",
  3: "כל רבעון",
  12: "כל שנה",
};

export type FormDefaults = {
  merchantKey: string;
  label: string;
  amount: number | null;
  day: number | null;
  period: number;
  kind: RecurringItem["kind"];
  tag: Tag | null;
  categoryId: string | null;
};

export function FixedCostForm({ defaults, submitLabel, onDone }: { defaults: FormDefaults; submitLabel: string; onDone?: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveItem, {});
  useEffect(() => {
    if (state.ok) onDone?.();
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="merchant_key" value={defaults.merchantKey} />
      <input type="hidden" name="category_id" value={defaults.categoryId ?? ""} />

      <label className="block text-sm">
        <span className="mb-1 block text-muted">שם</span>
        <input name="label" defaultValue={defaults.label} required className="input" />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">סכום צפוי (₪)</span>
          <input name="amount" defaultValue={defaults.amount ?? ""} inputMode="decimal" className="input" dir="ltr" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">יום בחודש</span>
          <input name="day" type="number" min={1} max={31} defaultValue={defaults.day ?? ""} className="input" dir="ltr" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">תדירות</span>
          <select name="period" defaultValue={defaults.period} className="input">
            {Object.entries(PERIOD_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">סוג</span>
          <select name="kind" defaultValue={defaults.kind} className="input">
            {Object.entries(KIND_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="flex gap-2 text-sm">
        <legend className="sr-only">שייך ל</legend>
        {(["apartment", "personal"] as Tag[]).map((t) => (
          <label key={t} className="cursor-pointer">
            <input type="radio" name="tag" value={t} defaultChecked={defaults.tag === t} className="peer sr-only" />
            <span className="block rounded-full border border-border px-4 py-1.5 peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-foreground">
              {TAG_LABEL[t]}
            </span>
          </label>
        ))}
      </fieldset>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-xl bg-accent py-2.5 font-semibold text-accent-foreground disabled:opacity-60">
        {pending ? "שומר…" : submitLabel}
      </button>
    </form>
  );
}
