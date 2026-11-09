import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getHousehold } from "@/lib/household";
import { currentMonth, isMonth, monthLabel, monthRange, shiftMonth, todayIL } from "@/lib/dates";
import { aheadOfPace, budgetLines, monthProgress, type BudgetRow } from "@/lib/budget";
import { categoryOptions } from "@/lib/categories";
import type { ExpenseRow } from "@/lib/stats";
import type { Category } from "@/lib/types";
import { BudgetBar } from "@/components/BudgetBar";
import { BudgetEditor } from "./BudgetEditor";
import { copyPreviousMonth } from "./actions";

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ month?: string; edit?: string }> }) {
  const sp = await searchParams;
  const month = isMonth(sp.month) ? sp.month : currentMonth();
  const editing = sp.edit === "1";
  const { me, partner, members } = await getHousehold();
  const supabase = await createClient();
  const { start, end } = monthRange(month);
  const prevMonth = shiftMonth(month, -1);

  const [{ data: expenses }, { data: budgets }, { data: categories }, { count: prevCount }] = await Promise.all([
    supabase
      .from("transactions")
      .select("date, amount, paid_by, tag, category_id, transaction_splits(member_id, amount)")
      .eq("kind", "expense")
      .gte("date", start)
      .lt("date", end),
    supabase.from("budgets").select("id, month, member_id, category_id, amount").eq("month", start),
    supabase.from("categories").select("id, name, parent_id, default_tag, sort_order"),
    supabase.from("budgets").select("id", { count: "exact", head: true }).eq("month", `${prevMonth}-01`),
  ]);

  const rows = (budgets ?? []) as BudgetRow[];
  const cats = (categories ?? []) as Category[];
  const lines = budgetLines((expenses ?? []) as ExpenseRow[], rows, cats, members);
  const progress = monthProgress(month, todayIL());
  const isCurrent = month === currentMonth();

  const amountOf = (memberId: string | null, categoryId: string | null) =>
    rows.find((r) => r.member_id === memberId && r.category_id === categoryId)?.amount ?? null;
  const parentCats = categoryOptions(cats.filter((c) => !c.parent_id));
  const capLabel = (id: string) => cats.find((c) => c.id === id)?.name ?? "";

  const href = (m: string, edit = editing) => `/budget?month=${m}${edit ? "&edit=1" : ""}`;

  return (
    <main className="space-y-5">
      <header className="flex items-center justify-between">
        <Link href={href(prevMonth)} className="px-2 text-2xl text-muted" aria-label="חודש קודם">
          ›
        </Link>
        <h1 className="text-xl font-bold">תקציב · {monthLabel(month)}</h1>
        <Link href={href(shiftMonth(month, 1))} className="px-2 text-2xl text-muted" aria-label="חודש הבא">
          ‹
        </Link>
      </header>

      {isCurrent && (
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>עברו {Math.round(progress * 100)}% מהחודש</span>
          </div>
          <div className="h-1 rounded-full bg-grid">
            <div className="h-full rounded-full bg-muted" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}

      {rows.length === 0 && !editing ? (
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-5 text-center">
          <p className="font-semibold">עוד לא נקבע תקציב ל{monthLabel(month)}</p>
          <div className="flex flex-col gap-2">
            {(prevCount ?? 0) > 0 && (
              <form action={copyPreviousMonth.bind(null, month)}>
                <button className="w-full rounded-xl bg-accent py-2.5 font-semibold text-accent-foreground">
                  העתקה מ{monthLabel(prevMonth)}
                </button>
              </form>
            )}
            <Link href={href(month, true)} className="rounded-xl border border-border py-2.5 font-semibold">
              קביעת תקציב
            </Link>
          </div>
        </section>
      ) : (
        <>
          {!editing && (
            <section className="space-y-5 rounded-2xl border border-border bg-surface p-4">
              {lines.map((l) => (
                <BudgetBar key={l.key} line={l} pace={isCurrent && aheadOfPace(l, progress)} />
              ))}
              <Link href={href(month, true)} className="block pt-1 text-center text-sm font-semibold text-accent">
                עריכת התקציב
              </Link>
            </section>
          )}

          {editing && (
            <section className="space-y-4 rounded-2xl border border-border bg-surface p-4">
              <BudgetEditor
                month={month}
                meId={me.id}
                shared={amountOf(null, null)}
                mine={amountOf(me.id, null)}
                partner={partner ? { name: partner.display_name, amount: amountOf(partner.id, null) } : null}
                caps={rows
                  .filter((r) => r.category_id && !r.member_id)
                  .map((r) => ({ categoryId: r.category_id!, label: capLabel(r.category_id!), amount: r.amount }))}
                categories={parentCats}
              />
              <Link href={href(month, false)} className="block w-full rounded-xl bg-accent py-2.5 text-center font-semibold text-accent-foreground">
                סיום
              </Link>
            </section>
          )}
        </>
      )}
    </main>
  );
}
