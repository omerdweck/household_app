"use client";

import { useActionState, useState } from "react";
import type { CategoryOption } from "@/lib/categories";
import { KIND_LABEL, TAG_LABEL, type Account, type Member, type Tag, type TxKind } from "@/lib/types";
import type { FormState } from "./actions";

type Defaults = {
  date: string;
  amount?: number;
  merchant?: string;
  category_id?: string | null;
  tag?: Tag | null;
  paid_by: string;
  account_id?: string | null;
  kind?: TxKind;
  notes?: string | null;
};

type Props = {
  mode: "new" | "edit";
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults: Defaults;
  me: Member;
  partner: Member | null;
  accounts: Account[];
  categories: CategoryOption[];
  /** Imported rows: the account and source facts are fixed. */
  imported?: boolean;
};

export function TransactionForm({ mode, action, defaults, me, partner, accounts, categories, imported }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const [paidBy, setPaidBy] = useState(defaults.paid_by);
  const [categoryId, setCategoryId] = useState(defaults.category_id ?? "");
  const [tag, setTag] = useState<Tag | "">(defaults.tag ?? "");
  const [tagTouched, setTagTouched] = useState(Boolean(defaults.tag));
  const [kind, setKind] = useState<TxKind>(defaults.kind ?? "expense");

  // Picking a category suggests its tag (דירה / אישי) until the user picks one themselves.
  function onCategory(id: string) {
    setCategoryId(id);
    if (!tagTouched) setTag(categories.find((c) => c.id === id)?.defaultTag ?? "");
  }

  const payerAccounts = accounts.filter((a) => a.member_id === paidBy && a.is_active);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="סכום (₪)">
          <input
            name="amount"
            required
            inputMode="decimal"
            defaultValue={defaults.amount !== undefined ? defaults.amount.toFixed(2) : ""}
            className="input text-lg font-semibold"
            dir="ltr"
            placeholder="0.00"
          />
        </Field>
        <Field label="תאריך">
          <input name="date" type="date" required defaultValue={defaults.date} className="input" />
        </Field>
      </div>

      <Field label="בית עסק / תיאור">
        <input name="merchant" required defaultValue={defaults.merchant ?? ""} className="input" placeholder="למשל: שכר דירה" />
      </Field>

      <Field label="קטגוריה">
        <select name="category_id" value={categoryId} onChange={(e) => onCategory(e.target.value)} className="input">
          <option value="">ללא קטגוריה</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>

      <fieldset>
        <legend className="mb-1 text-sm text-muted">שייך ל</legend>
        <div className="flex gap-2">
          {(["apartment", "personal"] as Tag[]).map((t) => (
            <Chip
              key={t}
              name="tag"
              value={t}
              checked={tag === t}
              onChange={() => {
                setTag(t);
                setTagTouched(true);
              }}
            >
              {TAG_LABEL[t]}
            </Chip>
          ))}
        </div>
      </fieldset>

      {partner && (
        <fieldset>
          <legend className="mb-1 text-sm text-muted">מי שילם</legend>
          <div className="flex gap-2">
            {[me, partner].map((m) => (
              <Chip key={m.id} name="paid_by" value={m.id} checked={paidBy === m.id} onChange={() => setPaidBy(m.id)}>
                {m.id === me.id ? "אני" : m.display_name}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}
      {!partner && <input type="hidden" name="paid_by" value={me.id} />}

      {mode === "new" && partner && kind === "expense" && (
        <fieldset>
          <legend className="mb-1 text-sm text-muted">חלוקה</legend>
          <div className="flex flex-wrap gap-2">
            <Chip name="split" value="payer" defaultChecked>
              הכל על מי ששילם
            </Chip>
            <Chip name="split" value="equal">
              חצי־חצי
            </Chip>
            <Chip name="split" value="other">
              הכל על השני
            </Chip>
          </div>
        </fieldset>
      )}

      {!imported && (
        <Field label="מאיזה חשבון (לא חובה)">
          <select name="account_id" defaultValue={defaults.account_id ?? ""} className="input" key={paidBy}>
            <option value="">מזומן / אחר</option>
            {payerAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      {mode === "edit" && (
        <Field label="סוג">
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as TxKind)} className="input">
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="הערה (לא חובה)">
        <input name="notes" defaultValue={defaults.notes ?? ""} className="input" />
      </Field>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}

      <button
        disabled={pending}
        className="w-full rounded-xl bg-accent py-3 font-semibold text-accent-foreground disabled:opacity-60"
      >
        {pending ? "שומר…" : mode === "new" ? "הוספה" : "שמירת שינויים"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      {children}
    </label>
  );
}

function Chip({
  name,
  value,
  checked,
  defaultChecked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="cursor-pointer">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span className="block rounded-full border border-border px-4 py-1.5 text-sm peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-foreground">
        {children}
      </span>
    </label>
  );
}
