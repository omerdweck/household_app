import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getHousehold } from "@/lib/household";
import { currentMonth, monthRange } from "@/lib/dates";
import { budgetLines, type BudgetRow } from "@/lib/budget";
import type { ExpenseRow } from "@/lib/stats";
import type { Category } from "@/lib/types";
import { BudgetBar } from "@/components/BudgetBar";

const MODULES = [
  { title: "הוצאות", href: "/transactions", note: "רשימה, הוספה וחלוקה" },
  { title: "סיכום", href: "/summary", note: "מי הוציא כמה ועל מה" },
  { title: "תקציב חודשי", href: "/budget", note: "קופה משותפת ואישי" },
  { title: "ייבוא קובץ", href: "/import", note: "פירוט עסקאות מהבנק / מקס" },
  { title: "החשבונות שלי", href: "/accounts", note: "בנקים וכרטיסי אשראי" },
  { title: "חשבונות דירה", note: "בקרוב · שלב 2" },
  { title: "לו״ז זוגי", note: "בקרוב · שלב 4" },
  { title: "רשימת קניות", note: "בקרוב · שלב 5" },
];

export default async function HomePage() {
  const { me, partner, members } = await getHousehold();
  const supabase = await createClient();
  const { start, end } = monthRange(currentMonth());

  const [{ data: budgets }, { data: expenses }, { data: categories }] = await Promise.all([
    supabase.from("budgets").select("id, month, member_id, category_id, amount").eq("month", start),
    supabase
      .from("transactions")
      .select("date, amount, paid_by, tag, category_id, transaction_splits(member_id, amount)")
      .eq("kind", "expense")
      .gte("date", start)
      .lt("date", end),
    supabase.from("categories").select("id, name, parent_id, default_tag, sort_order"),
  ]);

  // Only the budgets that need attention: 80% and up.
  const alerts = budgetLines(
    (expenses ?? []) as ExpenseRow[],
    (budgets ?? []) as BudgetRow[],
    (categories ?? []) as Category[],
    members,
  ).filter((l) => l.level !== "ok");

  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">שלום, {me.display_name}</h1>
          <p className="text-sm text-muted">
            {partner ? `משק הבית שלך ושל ${partner.display_name}` : "משק הבית שלך"}
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="rounded-lg border border-border px-3 py-1.5 text-sm">יציאה</button>
        </form>
      </header>

      {alerts.length > 0 && (
        <Link href="/budget" className="block space-y-4 rounded-2xl border-2 border-status-warning p-4">
          <p className="text-sm font-semibold">
            <span aria-hidden>⚠</span> {alerts.length === 1 ? "תקציב אחד דורש תשומת לב" : `${alerts.length} תקציבים דורשים תשומת לב`}
          </p>
          {alerts.map((l) => (
            <BudgetBar key={l.key} line={l} />
          ))}
        </Link>
      )}

      <ul className="grid grid-cols-2 gap-3">
        {MODULES.map((m) => {
          const body = (
            <>
              <p className="font-semibold">{m.title}</p>
              <p className="mt-1 text-xs text-muted">{m.note}</p>
            </>
          );
          return (
            <li key={m.title}>
              {m.href ? (
                <Link href={m.href} className="block rounded-2xl border border-border bg-surface p-4 active:opacity-70">
                  {body}
                </Link>
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-4 opacity-60">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
