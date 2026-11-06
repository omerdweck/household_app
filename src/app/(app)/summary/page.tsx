import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getHousehold } from "@/lib/household";
import { currentMonth, isMonth, monthLabel, monthRange, shiftMonth } from "@/lib/dates";
import { formatILS } from "@/lib/money";
import { monthlyTrend, percentChange, summarizeMonth, type ExpenseRow } from "@/lib/stats";
import type { Category } from "@/lib/types";
import { seriesFor } from "@/components/charts/series";
import { ShareBar } from "@/components/charts/ShareBar";
import { CategoryBars } from "@/components/charts/CategoryBars";
import { TrendColumns } from "@/components/charts/TrendColumns";

const TREND_MONTHS = 6;

export default async function SummaryPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = isMonth(sp.month) ? sp.month : currentMonth();
  const { me, partner, members } = await getHousehold();
  const supabase = await createClient();

  const months = Array.from({ length: TREND_MONTHS }, (_, i) => shiftMonth(month, i - (TREND_MONTHS - 1)));
  const from = monthRange(months[0]).start;
  const to = monthRange(month).end;

  const [{ data }, { data: categories }] = await Promise.all([
    supabase
      .from("transactions")
      .select("date, amount, paid_by, tag, category_id, transaction_splits(member_id, amount)")
      .eq("kind", "expense")
      .gte("date", from)
      .lt("date", to),
    supabase.from("categories").select("id, name, parent_id, default_tag, sort_order"),
  ]);

  const rows = (data ?? []) as ExpenseRow[];
  const cats = (categories ?? []) as Category[];
  const ids = members.map((m) => m.id);
  const inMonth = (m: string) => rows.filter((r) => r.date.startsWith(m));

  const s = summarizeMonth(inMonth(month), cats, ids, me.id);
  const prev = summarizeMonth(inMonth(shiftMonth(month, -1)), cats, ids, me.id);
  const change = percentChange(s.total, prev.total);
  const trend = monthlyTrend(rows, months, ids);
  const series = seriesFor(members, me.id);

  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <Link href={`/summary?month=${shiftMonth(month, -1)}`} className="px-2 text-2xl text-muted" aria-label="חודש קודם">
          ›
        </Link>
        <h1 className="text-xl font-bold">{monthLabel(month)}</h1>
        <Link href={`/summary?month=${shiftMonth(month, 1)}`} className="px-2 text-2xl text-muted" aria-label="חודש הבא">
          ‹
        </Link>
      </header>

      {/* Hero: the one number this screen leads with */}
      <section>
        <p className="text-sm text-muted">סה״כ הוצאות</p>
        <p className="text-5xl font-bold tracking-tight" dir="ltr" style={{ textAlign: "right" }}>
          {formatILS(s.total)}
        </p>
        <p className="mt-1 text-sm text-muted">
          {s.count} הוצאות
          {change !== null && (
            <>
              {" · "}
              {change === 0 ? "כמו בחודש הקודם" : `${change > 0 ? "▲" : "▼"} ${Math.abs(change)}% מהחודש הקודם`}
            </>
          )}
        </p>
      </section>

      {s.count === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-6 text-center text-muted">
          אין הוצאות בחודש הזה.{" "}
          <Link href="/import" className="text-accent underline">
            לייבוא קובץ
          </Link>
        </p>
      ) : (
        <>
          {partner && (
            <Card title="מי נושא בהוצאות">
              <ShareBar series={series} amounts={s.carried} />
              <Balance balance={s.balance} partnerName={partner.display_name} />
            </Card>
          )}

          <Card title="דירה מול אישי">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="pb-1 text-start font-normal" />
                  {members.map((m) => (
                    <th key={m.id} className="pb-1 text-end font-normal">
                      {m.id === me.id ? "אני" : m.display_name}
                    </th>
                  ))}
                  {partner && <th className="pb-1 text-end font-normal">ביחד</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(
                  [
                    ["דירה", s.apartment],
                    ["אישי", s.personal],
                  ] as const
                ).map(([label, byMember]) => (
                  <tr key={label}>
                    <td className="py-2">{label}</td>
                    {members.map((m) => (
                      <td key={m.id} className="py-2 text-end" dir="ltr">
                        {formatILS(byMember[m.id] ?? 0)}
                      </td>
                    ))}
                    {partner && (
                      <td className="py-2 text-end font-semibold" dir="ltr">
                        {formatILS(Object.values(byMember).reduce((a, b) => a + b, 0))}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {s.untagged > 0 && (
              <p className="mt-2 text-xs text-muted">
                <bdi dir="ltr">{formatILS(s.untagged)}</bdi> עוד לא סומנו כדירה או אישי.
              </p>
            )}
          </Card>

          <Card title="לפי קטגוריה">
            <CategoryBars data={s.byCategory} series={series} />
          </Card>

          <Card title={`${TREND_MONTHS} חודשים אחרונים`}>
            <TrendColumns data={trend} series={series} current={month} />
          </Card>
        </>
      )}
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Balance({ balance, partnerName }: { balance: number; partnerName: string }) {
  if (Math.abs(balance) < 0.01) return <p className="text-sm text-muted">החודש אתם מאוזנים.</p>;
  // Gender-neutral on purpose: both partners see this screen.
  const text = balance > 0 ? `מגיע לך מ${partnerName}` : `מגיע ל${partnerName} ממך`;
  return (
    <p className="rounded-xl bg-background p-3 text-sm">
      {text} <bdi dir="ltr" className="font-bold">{formatILS(Math.abs(balance))}</bdi>
      <span className="block text-xs text-muted">לפי ההוצאות שחולקו החודש. החזרים בביט יחושבו בשלב 2.</span>
    </p>
  );
}
