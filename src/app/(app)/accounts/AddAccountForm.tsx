"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addAccount, type FormState } from "./actions";
import { PROVIDERS, type Provider } from "@/lib/types";

export function AddAccountForm({ defaultLabelOwner }: { defaultLabelOwner: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addAccount, {});
  const [provider, setProvider] = useState<Provider>("max");
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-accent py-3 font-semibold text-accent"
      >
        + הוספת בנק או כרטיס אשראי
      </button>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <label className="block text-sm">
        <span className="mb-1 block text-muted">בנק / חברת אשראי</span>
        <select
          name="provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value as Provider)}
          className="input"
        >
          {Object.entries(PROVIDERS).map(([key, p]) => (
            <option key={key} value={key}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      {PROVIDERS[provider].type === null && (
        <label className="block text-sm">
          <span className="mb-1 block text-muted">סוג</span>
          <select name="type" className="input" defaultValue="credit_card">
            <option value="credit_card">כרטיס אשראי</option>
            <option value="bank">חשבון בנק</option>
          </select>
        </label>
      )}

      <label className="block text-sm">
        <span className="mb-1 block text-muted">שם לתצוגה</span>
        <input
          name="label"
          required
          className="input"
          placeholder={`${PROVIDERS[provider].label} של ${defaultLabelOwner}`}
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-muted">4 ספרות אחרונות (לא חובה)</span>
        <input name="last4" inputMode="numeric" maxLength={4} pattern="\d{4}" className="input" dir="ltr" />
      </label>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}

      <div className="flex gap-2">
        <button disabled={pending} className="flex-1 rounded-xl bg-accent py-2.5 font-semibold text-accent-foreground disabled:opacity-60">
          {pending ? "שומר…" : "שמירה"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-border px-4">
          ביטול
        </button>
      </div>
    </form>
  );
}
