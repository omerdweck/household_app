import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getHousehold, memberName } from "@/lib/household";
import { currentMonth, dayLabel, isMonth, monthLabel, monthRange, shiftMonth } from "@/lib/dates";
import { describeSplit, formatILS, type Split } from "@/lib/money";
import { KIND_LABEL, TAG_LABEL, type Tag, type TxKind, type TxStatus } from "@/lib/types";

type Row = {
  id: string;
  date: string;
  amount: number;
  merchant: string;
  tag: Tag | null;
  kind: TxKind;
  status: TxStatus;
  paid_by: string;
  categories: { name: string } | null;
  transaction_splits: Split[];
};

type Who = "all" | "me" | "partner";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; who?: string }>;
}) {
  const sp = await searchParams;
  const month = isMonth(sp.month) ? sp.month : currentMonth();
  const who: Who = sp.who === "me" || sp.who === "partner" ? sp.who : "all";

  const h = await getHousehold();
  const { me, partner } = h;
  const supabase = await createClient();
  const { start, end } = monthRange(month);

  const { data } = await supabase
    .from("transactions")
    .select("id, date, amount, merchant, tag, kind, status, paid_by, categories(name), transaction_splits(member_id, amount)")
    .gte("date", start)
    .lt("date", end)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];

  // Totals count only real expenses, by who CARRIES them (the splits), not who paid.
  const expenses = rows.filter((r) => r.kind === "expense");
  const carried = (memberId: string) =>
    expenses.reduce((sum, r) => sum + (r.transaction_splits.find((s) => s.member_id === memberId)?.amount ?? 0), 0);
  const total = expenses.reduce((s, r) => s + r.amount, 0);
  const apartment = expenses.filter((r) => r.tag === "apartment").reduce((s, r) => s + r.amount, 0);

  const focus = who === "me" ? me.id : who === "partner" ? partner?.id : undefined;
  const visible = focus
    ? rows.filter((r) => r.transaction_splits.some((s) => s.member_id === focus && s.amount !== 0))
    : rows;

  const byDay = new Map<string, Row[]>();
  for (const r of visible) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);

  const link = (params: { month?: string; who?: Who }) => {
    const q = new URLSearchParams({ month: params.month ?? month, who: params.who ?? who });
    if (q.get("who") === "all") q.delete("who");
    return `/transactions?${q}`;
  };

  return (
    <main className="space-y-5">
      <header className="flex items-center justify-between">
        <Link href={link({ month: shiftMonth(month, -1) })} className="px-2 text-2xl text-muted" aria-label="חודש קודם">
          ›
        </Link>
        <h1 className="text-xl font-bold">{monthLabel(month)}</h1>
        <Link href={link({ month: shiftMonth(month, 1) })} className="px-2 text-2xl text-muted" aria-label="חודש הבא">
          ‹
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-2">
        <Stat label="סה״כ הוצאות" value={total} strong />
        <Stat label="מתוכן דירה" value={apartment} />
        <Stat label="החלק שלי" value={carried(me.id)} />
        {partner && <Stat label={`החלק של ${partner.display_name}`} value={carried(partner.id)} />}
      </section>

      <nav className="flex items-center gap-2 text-sm">
        {partner && (
          <>
          {(
            [
              ["all", "הכל"],
              ["me", "שלי"],
              ["partner", `של ${partner.display_name}`],
            ] as [Who, string][]
          ).map(([value, label]) => (
            <Link
              key={value}
              href={link({ who: value })}
              className={`rounded-full border px-4 py-1.5 ${
                who === value ? "border-accent bg-accent text-accent-foreground" : "border-border"
              }`}
            >
              {label}
            </Link>
          ))}
          </>
        )}
        {/* In the header row rather than a floating button, so it never covers an amount */}
        <Link
          href="/transactions/new"
          className="ms-auto rounded-full bg-accent px-4 py-1.5 font-semibold text-accent-foreground"
        >
          + הוספה
        </Link>
      </nav>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-muted">אין הוצאות בחודש הזה.</p>
      ) : (
        [...byDay.entries()].map(([day, list]) => (
          <section key={day}>
            <h2 className="mb-1 text-xs font-semibold text-muted">{dayLabel(day)}</h2>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {list.map((r) => {
                const splitNote = r.kind === "expense" ? describeSplit(r.transaction_splits, r.amount, me.id) : "";
                const meta = [
                  r.categories?.name,
                  r.tag && TAG_LABEL[r.tag],
                  partner && `שילם: ${memberName(h, r.paid_by)}`,
                  splitNote,
                ].filter(Boolean);
                return (
                  <li key={r.id}>
                    <Link href={`/transactions/${r.id}`} className="flex items-center justify-between gap-3 p-3 active:opacity-70">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {r.merchant}
                          {r.status === "provisional" && (
                            <span className="ms-2 rounded bg-border px-1.5 text-[10px] text-muted">זמני</span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {r.kind === "expense" ? meta.join(" · ") : KIND_LABEL[r.kind]}
                        </p>
                      </div>
                      <p
                        className={`shrink-0 font-semibold ${r.kind === "expense" ? "" : "text-muted line-through"}`}
                        dir="ltr"
                      >
                        {formatILS(r.amount)}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 ${strong ? "bg-accent text-accent-foreground" : "border border-border bg-surface"}`}>
      <p className={`text-xs ${strong ? "opacity-80" : "text-muted"}`}>{label}</p>
      <p className="text-lg font-bold" dir="ltr">
        {formatILS(value)}
      </p>
    </div>
  );
}
