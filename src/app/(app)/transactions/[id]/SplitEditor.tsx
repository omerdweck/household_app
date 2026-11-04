"use client";

import { useState, useTransition } from "react";
import { allOn, equalSplit, formatILS, fromCents, parseAmount, percentSplit, toCents, type Split } from "@/lib/money";
import type { Member } from "@/lib/types";
import { saveSplits } from "../actions";

type Props = {
  transactionId: string;
  amount: number;
  paidBy: string;
  splits: Split[];
  me: Member;
  partner: Member;
};

export function SplitEditor({ transactionId, amount, paidBy, splits, me, partner }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [mineInput, setMineInput] = useState("");

  const share = (id: string) => splits.find((s) => s.member_id === id)?.amount ?? 0;
  const other = paidBy === me.id ? partner : me;

  function apply(next: Split[]) {
    setError(null);
    startTransition(async () => {
      const res = await saveSplits(transactionId, next);
      if (res.error) setError(res.error);
      else setCustom(false);
    });
  }

  const mine = parseAmount(mineInput);
  const mineValid = mine !== null && Math.abs(toCents(mine)) <= Math.abs(toCents(amount));
  const partnerRest = mineValid ? fromCents(toCents(amount) - toCents(mine)) : null;

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">חלוקה</h2>

      <div className="grid grid-cols-2 gap-2 text-center">
        {[me, partner].map((m) => (
          <div key={m.id} className="rounded-xl bg-background p-3">
            <p className="text-xs text-muted">{m.id === me.id ? "החלק שלי" : `החלק של ${m.display_name}`}</p>
            <p className="text-lg font-bold" dir="ltr">
              {formatILS(share(m.id))}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => apply(equalSplit(amount, paidBy, other.id))} disabled={pending}>
          חלק שווה
        </Button>
        <Button onClick={() => apply(allOn(amount, me.id))} disabled={pending}>
          הכל עליי
        </Button>
        <Button onClick={() => apply(allOn(amount, partner.id))} disabled={pending}>
          הכל על {partner.display_name}
        </Button>
        <Button onClick={() => setCustom((v) => !v)} disabled={pending} variant="outline">
          עריכת חלוקה
        </Button>
      </div>

      {custom && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex flex-wrap gap-2">
            {[30, 40, 60, 70].map((p) => (
              <Button key={p} onClick={() => apply(percentSplit(amount, me.id, p, partner.id))} disabled={pending} variant="outline">
                אני {p}%
              </Button>
            ))}
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">או סכום מדויק שעליי (₪)</span>
            <input
              value={mineInput}
              onChange={(e) => setMineInput(e.target.value)}
              inputMode="decimal"
              className="input"
              dir="ltr"
              placeholder={String(share(me.id))}
            />
          </label>
          {partnerRest !== null && (
            <p className="text-sm text-muted">
              ועל {partner.display_name}: <span dir="ltr">{formatILS(partnerRest)}</span>
            </p>
          )}
          <button
            disabled={!mineValid || pending}
            onClick={() =>
              mine !== null &&
              apply([
                { member_id: me.id, amount: mine },
                { member_id: partner.id, amount: partnerRest ?? 0 },
              ])
            }
            className="w-full rounded-xl bg-accent py-2.5 font-semibold text-accent-foreground disabled:opacity-50"
          >
            שמירת חלוקה
          </button>
        </div>
      )}

      {pending && <p className="text-sm text-muted">שומר…</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}

function Button({
  children,
  onClick,
  disabled,
  variant = "solid",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "solid" | "outline";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-4 py-1.5 text-sm disabled:opacity-50 ${
        variant === "solid" ? "bg-accent text-accent-foreground" : "border border-border"
      }`}
    >
      {children}
    </button>
  );
}
