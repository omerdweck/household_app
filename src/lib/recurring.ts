// Fixed costs: find charges that repeat on a schedule, and tell whether this
// cycle's payment has arrived. Pure functions over transaction rows, unit-tested.

import { fromCents, toCents } from "@/lib/money";
import type { Tag } from "@/lib/types";

export type ChargeRow = {
  date: string; // YYYY-MM-DD
  amount: number;
  merchant: string;
  merchant_key: string | null;
  category_id: string | null;
  tag: Tag | null;
};

export type Suggestion = {
  merchantKey: string;
  label: string; // the latest merchant text, for display
  periodMonths: 1 | 2;
  dayOfMonth: number;
  typicalAmount: number; // median
  occurrences: number;
  lastDate: string;
  categoryId: string | null;
  tag: Tag | null;
};

export type RecurringItem = {
  id: string;
  merchant_pattern: string;
  label: string;
  expected_amount: number | null;
  day_of_month: number | null;
  period_months: number;
  kind: "bill" | "standing_order" | "subscription";
  tag: Tag | null;
  is_active: boolean;
};

// ---------- small date helpers on YYYY-MM strings ----------

const monthIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const fromIndex = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
const daysIn = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Day 31 in a 30-day month means the last day. */
export function dueDate(month: string, day: number): string {
  return `${month}-${String(Math.min(day, daysIn(month))).padStart(2, "0")}`;
}

// ---------- detection ----------

export type DetectOptions = {
  minOccurrences?: number; // default 3
  /** Each charge must be within this factor of the median (0.5 → 50%–150%). */
  amountTolerance?: number;
};

/**
 * A merchant is a fixed cost when it is charged
 *  1. at least `minOccurrences` times,
 *  2. at most once per calendar month (a café visited weekly is not a bill),
 *  3. on a regular gap of 1 or 2 months,
 *  4. for a similar amount each time, and
 *  5. recently enough that it is still running.
 */
export function detectRecurring(rows: ChargeRow[], today: string, opts: DetectOptions = {}): Suggestion[] {
  const minOcc = opts.minOccurrences ?? 3;
  const tol = opts.amountTolerance ?? 0.5;

  const groups = new Map<string, ChargeRow[]>();
  for (const r of rows) {
    if (!r.merchant_key || r.amount <= 0) continue;
    groups.set(r.merchant_key, [...(groups.get(r.merchant_key) ?? []), r]);
  }

  const out: Suggestion[] = [];
  for (const [key, list] of groups) {
    if (list.length < minOcc) continue;

    const byMonth = new Map<string, ChargeRow[]>();
    for (const r of list) byMonth.set(r.date.slice(0, 7), [...(byMonth.get(r.date.slice(0, 7)) ?? []), r]);
    const months = [...byMonth.keys()].sort();
    if (months.length < minOcc) continue;

    // (2) once per month — allow one exception (a late + early charge in the same month)
    const crowded = [...byMonth.values()].filter((v) => v.length > 1).length;
    if (crowded > 1) continue;

    // (3) regular gap
    const gaps = months.slice(1).map((m, i) => monthIndex(m) - monthIndex(months[i]));
    const period = median(gaps);
    if (period !== 1 && period !== 2) continue;
    if (gaps.filter((g) => g === period).length / gaps.length < 0.7) continue;

    // (4) similar amount
    const amounts = list.map((r) => r.amount);
    const typical = median(amounts);
    if (amounts.some((a) => a < typical * (1 - tol) || a > typical * (1 + tol))) continue;

    // (5) still running: last charge no more than one cycle + one month ago
    const last = list.reduce((a, b) => (b.date > a.date ? b : a));
    if (monthIndex(today.slice(0, 7)) - monthIndex(last.date.slice(0, 7)) > period + 1) continue;

    out.push({
      merchantKey: key,
      label: last.merchant,
      periodMonths: period,
      dayOfMonth: Math.round(median(list.map((r) => Number(r.date.slice(8, 10))))),
      typicalAmount: fromCents(toCents(typical)),
      occurrences: list.length,
      lastDate: last.date,
      categoryId: last.category_id,
      tag: last.tag,
    });
  }

  // Biggest fixed costs first
  return out.sort((a, b) => b.typicalAmount - a.typicalAmount);
}

/** A first guess at what kind of fixed cost this is; the user can change it. */
export function guessKind(s: Pick<Suggestion, "tag" | "typicalAmount" | "periodMonths">): RecurringItem["kind"] {
  if (s.tag === "apartment" || s.periodMonths === 2) return "bill";
  if (s.typicalAmount < 150) return "subscription";
  return "standing_order";
}

// ---------- this cycle's status ----------

export type CycleStatus =
  | { state: "paid"; date: string; amount: number }
  | { state: "upcoming"; due: string }
  | { state: "due"; due: string } // due date passed within the grace period
  | { state: "missing"; due: string };

export const GRACE_DAYS = 5;

/**
 * Has this cycle's charge arrived?
 * For a bimonthly bill, a payment last month still covers this month.
 */
export function cycleStatus(item: RecurringItem, history: ChargeRow[], today: string): CycleStatus {
  const p = item.period_months || 1;
  const thisMonth = today.slice(0, 7);
  const matches = history
    .filter((r) => r.merchant_key === item.merchant_pattern && r.amount > 0 && r.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));
  const last = matches[0];

  if (last && monthIndex(thisMonth) - monthIndex(last.date.slice(0, 7)) < p) {
    return { state: "paid", date: last.date, amount: last.amount };
  }

  // Next due month: one cycle after the last payment, or this month if never seen.
  const dueMonth = last ? fromIndex(monthIndex(last.date.slice(0, 7)) + p) : thisMonth;
  const due = dueDate(dueMonth > thisMonth ? dueMonth : thisMonth, item.day_of_month ?? 1);
  if (today < due) return { state: "upcoming", due };

  const graceEnd = new Date(Date.parse(due) + GRACE_DAYS * 86400000).toISOString().slice(0, 10);
  return today <= graceEnd ? { state: "due", due } : { state: "missing", due };
}

/** Monthly-equivalent cost: a 400 ₪ bimonthly bill costs 200 ₪ a month. */
export function monthlyEquivalent(item: Pick<RecurringItem, "expected_amount" | "period_months">): number {
  return fromCents(Math.round(toCents(item.expected_amount ?? 0) / (item.period_months || 1)));
}

/** Past charges of one item, newest first, for its history view. */
export function historyOf(item: RecurringItem, rows: ChargeRow[]): { date: string; amount: number }[] {
  return rows
    .filter((r) => r.merchant_key === item.merchant_pattern && r.amount > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((r) => ({ date: r.date, amount: r.amount }));
}
