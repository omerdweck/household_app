// Dashboard numbers. Pure functions over already-fetched expense rows, so every
// figure on the summary screen is unit-tested. Money is summed in agorot.

import { fromCents, toCents, type Split } from "@/lib/money";
import type { Category, Tag } from "@/lib/types";

export type ExpenseRow = {
  date: string; // YYYY-MM-DD
  amount: number;
  paid_by: string;
  tag: Tag | null;
  category_id: string | null;
  transaction_splits: Split[];
};

export type MemberAmounts = Record<string, number>;

export type CategoryTotal = {
  id: string | null; // parent category id; null = uncategorized
  name: string;
  total: number;
  byMember: MemberAmounts;
};

export type MonthSummary = {
  total: number;
  count: number;
  carried: MemberAmounts; // what each one's share adds up to (the splits)
  paid: MemberAmounts; // what each one actually paid
  apartment: MemberAmounts;
  personal: MemberAmounts;
  untagged: number;
  byCategory: CategoryTotal[];
  /** > 0: the partner owes `meId` this much for expenses shared this month. */
  balance: number;
};

const empty = (ids: string[]): Record<string, number> => Object.fromEntries(ids.map((id) => [id, 0]));
const toShekels = (m: Record<string, number>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, fromCents(v)]));

/** Roll child categories up to their parent ("חשבונות › חשמל" → "חשבונות"). */
export function parentOf(categories: Category[]): (id: string | null) => Category | null {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return (id) => {
    const c = id ? byId.get(id) : undefined;
    if (!c) return null;
    return c.parent_id ? byId.get(c.parent_id) ?? c : c;
  };
}

export function summarizeMonth(
  rows: ExpenseRow[],
  categories: Category[],
  memberIds: string[],
  meId: string,
  maxCategories = 8,
): MonthSummary {
  const carried = empty(memberIds);
  const paid = empty(memberIds);
  const apartment = empty(memberIds);
  const personal = empty(memberIds);
  let total = 0;
  let untagged = 0;
  let balance = 0;
  const cats = new Map<string, { id: string | null; name: string; total: number; byMember: Record<string, number> }>();
  const parent = parentOf(categories);

  for (const r of rows) {
    const amount = toCents(r.amount);
    total += amount;
    paid[r.paid_by] = (paid[r.paid_by] ?? 0) + amount;
    if (!r.tag) untagged += amount;

    const p = parent(r.category_id);
    const key = p?.id ?? "none";
    if (!cats.has(key)) cats.set(key, { id: p?.id ?? null, name: p?.name ?? "ללא קטגוריה", total: 0, byMember: empty(memberIds) });
    const cat = cats.get(key)!;
    cat.total += amount;

    for (const s of r.transaction_splits) {
      const share = toCents(s.amount);
      carried[s.member_id] = (carried[s.member_id] ?? 0) + share;
      cat.byMember[s.member_id] = (cat.byMember[s.member_id] ?? 0) + share;
      if (r.tag === "apartment") apartment[s.member_id] = (apartment[s.member_id] ?? 0) + share;
      if (r.tag === "personal") personal[s.member_id] = (personal[s.member_id] ?? 0) + share;

      // Someone else's share of what I paid: they owe me. My share of what they paid: I owe them.
      if (r.paid_by === meId && s.member_id !== meId) balance += share;
      if (r.paid_by !== meId && s.member_id === meId) balance -= share;
    }
  }

  // Largest first; fold the tail into "אחר" so the chart keeps a fixed number of rows.
  const sorted = [...cats.values()].sort((a, b) => b.total - a.total);
  const head = sorted.slice(0, maxCategories);
  const tail = sorted.slice(maxCategories);
  if (tail.length) {
    const other = { id: null, name: "אחר", total: 0, byMember: empty(memberIds) };
    for (const c of tail) {
      other.total += c.total;
      for (const id of memberIds) other.byMember[id] += c.byMember[id] ?? 0;
    }
    head.push(other);
  }

  return {
    total: fromCents(total),
    count: rows.length,
    carried: toShekels(carried),
    paid: toShekels(paid),
    apartment: toShekels(apartment),
    personal: toShekels(personal),
    untagged: fromCents(untagged),
    byCategory: head.map((c) => ({ ...c, total: fromCents(c.total), byMember: toShekels(c.byMember) })),
    balance: fromCents(balance),
  };
}

export type MonthPoint = { month: string; total: number; byMember: MemberAmounts };

/** One point per month, oldest first, including months with no expenses. */
export function monthlyTrend(rows: ExpenseRow[], months: string[], memberIds: string[]): MonthPoint[] {
  const points = new Map(months.map((m) => [m, { total: 0, byMember: empty(memberIds) }]));
  for (const r of rows) {
    const p = points.get(r.date.slice(0, 7));
    if (!p) continue;
    p.total += toCents(r.amount);
    for (const s of r.transaction_splits) p.byMember[s.member_id] = (p.byMember[s.member_id] ?? 0) + toCents(s.amount);
  }
  return months.map((m) => {
    const p = points.get(m)!;
    return { month: m, total: fromCents(p.total), byMember: toShekels(p.byMember) };
  });
}

/** Percent change, or null when there is nothing to compare against. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
