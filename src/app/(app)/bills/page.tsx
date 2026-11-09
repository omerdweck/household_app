import { createClient } from "@/lib/supabase/server";
import { getHousehold } from "@/lib/household";
import { shiftMonth, todayIL } from "@/lib/dates";
import { formatILS } from "@/lib/money";
import {
  cycleStatus,
  detectRecurring,
  historyOf,
  monthlyEquivalent,
  type ChargeRow,
  type RecurringItem,
} from "@/lib/recurring";
import { AddFixedCost, FixedCostCard, SuggestionCard } from "./Cards";

const HISTORY_MONTHS = 13;

export default async function BillsPage() {
  await getHousehold();
  const supabase = await createClient();
  const today = todayIL();
  const from = `${shiftMonth(today.slice(0, 7), -(HISTORY_MONTHS - 1))}-01`;

  const [{ data: recurring }, { data: charges }] = await Promise.all([
    supabase
      .from("recurring")
      .select("id, merchant_pattern, label, expected_amount, day_of_month, period_months, kind, tag, is_active, category_id")
      .order("expected_amount", { ascending: false }),
    supabase
      .from("transactions")
      .select("date, amount, merchant, merchant_key, category_id, tag")
      .eq("kind", "expense")
      .gte("date", from)
      .lte("date", today),
  ]);

  const all = (recurring ?? []) as (RecurringItem & { category_id: string | null })[];
  const rows = (charges ?? []) as ChargeRow[];
  const active = all.filter((r) => r.is_active);
  const known = new Set(all.map((r) => r.merchant_pattern)); // confirmed or dismissed
  const suggestions = detectRecurring(rows, today).filter((s) => !known.has(s.merchantKey));

  const items = active.map((item) => ({ item, status: cycleStatus(item, rows, today), history: historyOf(item, rows) }));
  const monthly = active.reduce((s, i) => s + monthlyEquivalent(i), 0);
  const apartment = active.filter((i) => i.tag === "apartment").reduce((s, i) => s + monthlyEquivalent(i), 0);
  const missing = items.filter((i) => i.status.state === "missing").length;

  // Recent merchants for manual add (most frequent first), excluding ones already tracked
  const freq = new Map<string, { label: string; n: number }>();
  for (const r of rows) {
    if (!r.merchant_key || known.has(r.merchant_key) || r.date < `${shiftMonth(today.slice(0, 7), -3)}-01`) continue;
    const f = freq.get(r.merchant_key) ?? { label: r.merchant, n: 0 };
    freq.set(r.merchant_key, { label: f.label, n: f.n + 1 });
  }
  const merchants = [...freq.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 60)
    .map(([key, v]) => ({ key, label: v.label }));

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">חשבונות קבועים</h1>
        <p className="text-sm text-muted">שכירות, חשבונות, הוראות קבע ומנויים — ומה כבר שולם החודש.</p>
      </header>

      {active.length > 0 && (
        <section className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-accent p-3 text-accent-foreground">
            <p className="text-xs opacity-80">עלות קבועה בחודש</p>
            <p className="text-lg font-bold" dir="ltr" style={{ textAlign: "right" }}>
              {formatILS(monthly)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">מתוכה דירה</p>
            <p className="text-lg font-bold" dir="ltr" style={{ textAlign: "right" }}>
              {formatILS(apartment)}
            </p>
          </div>
          {missing > 0 && (
            <p className="col-span-2 text-sm">
              <span aria-hidden className="font-bold text-status-critical">⚠</span>{" "}
              {missing === 1 ? "תשלום אחד לא נמצא החודש" : `${missing} תשלומים לא נמצאו החודש`} — אולי עוד לא יובא קובץ?
            </p>
          )}
        </section>
      )}

      {suggestions.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">נראה שאלה חוזרים על עצמם</h2>
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <SuggestionCard key={s.merchantKey} s={s} />
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">החודש</h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted">
            עוד אין חשבונות קבועים. אחרי ייבוא של כמה חודשים יופיעו כאן הצעות, או שאפשר להוסיף ידנית.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map(({ item, status, history }) => (
              <FixedCostCard key={item.id} item={item} status={status} history={history} />
            ))}
          </ul>
        )}
      </section>

      {merchants.length > 0 && <AddFixedCost merchants={merchants} />}
    </main>
  );
}
