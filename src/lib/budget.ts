// Monthly budget vs. actual. Pure functions over fetched rows, unit-tested.
//
// What each budget measures:
//   * shared pot   (member_id = null, category_id = null): every expense tagged "דירה", whole amounts
//   * personal     (member_id = X,    category_id = null): X's share (splits) of expenses tagged
//                                                          "אישי" or not tagged yet
//   * category cap (member_id = null, category_id = C):    everything in C (incl. its children)

import { fromCents, toCents } from "@/lib/money";
import type { ExpenseRow } from "@/lib/stats";
import type { Category } from "@/lib/types";

export type BudgetRow = {
  id: string;
  month: string; // YYYY-MM-01
  member_id: string | null;
  category_id: string | null;
  amount: number;
};

export type Level = "ok" | "warning" | "over";

export type BudgetLine = {
  key: string;
  kind: "shared" | "personal" | "category";
  label: string;
  memberId: string | null;
  categoryId: string | null;
  budget: number;
  spent: number;
  remaining: number;
  /** 0–100+, rounded */
  percent: number;
  level: Level;
};

export const WARNING_AT = 80;

export function levelFor(percent: number): Level {
  if (percent >= 100) return "over";
  if (percent >= WARNING_AT) return "warning";
  return "ok";
}

function line(
  base: Omit<BudgetLine, "remaining" | "percent" | "level" | "spent" | "budget">,
  budgetCents: number,
  spentCents: number,
): BudgetLine {
  const percent = budgetCents > 0 ? Math.round((spentCents / budgetCents) * 100) : spentCents > 0 ? 100 : 0;
  return {
    ...base,
    budget: fromCents(budgetCents),
    spent: fromCents(spentCents),
    remaining: fromCents(budgetCents - spentCents),
    percent,
    level: levelFor(percent),
  };
}

/** Category id → itself and every child, so a cap on "חשבונות" covers "חשמל", "מים"… */
function withChildren(categories: Category[], id: string): Set<string> {
  return new Set([id, ...categories.filter((c) => c.parent_id === id).map((c) => c.id)]);
}

export function budgetLines(
  expenses: ExpenseRow[],
  budgets: BudgetRow[],
  categories: Category[],
  members: { id: string; display_name: string }[],
): BudgetLine[] {
  const lines: BudgetLine[] = [];

  const shared = budgets.find((b) => !b.member_id && !b.category_id);
  if (shared) {
    const spent = expenses.filter((e) => e.tag === "apartment").reduce((s, e) => s + toCents(e.amount), 0);
    lines.push(
      line({ key: "shared", kind: "shared", label: "קופה משותפת (דירה)", memberId: null, categoryId: null },
        toCents(shared.amount), spent),
    );
  }

  for (const m of members) {
    const b = budgets.find((x) => x.member_id === m.id && !x.category_id);
    if (!b) continue;
    const spent = expenses
      .filter((e) => e.tag !== "apartment")
      .reduce((s, e) => s + toCents(e.transaction_splits.find((x) => x.member_id === m.id)?.amount ?? 0), 0);
    lines.push(
      line({ key: `member-${m.id}`, kind: "personal", label: `אישי · ${m.display_name}`, memberId: m.id, categoryId: null },
        toCents(b.amount), spent),
    );
  }

  const byName = new Map(categories.map((c) => [c.id, c.name]));
  for (const b of budgets.filter((x) => x.category_id && !x.member_id)) {
    const ids = withChildren(categories, b.category_id!);
    const spent = expenses
      .filter((e) => e.category_id && ids.has(e.category_id))
      .reduce((s, e) => s + toCents(e.amount), 0);
    lines.push(
      line({ key: `cat-${b.category_id}`, kind: "category", label: byName.get(b.category_id!) ?? "קטגוריה", memberId: null, categoryId: b.category_id },
        toCents(b.amount), spent),
    );
  }

  return lines;
}

/**
 * How far into the month we are (0–1), for "on pace" hints:
 * 60% of the budget spent on the 10th is a warning sign; on the 28th it is fine.
 */
export function monthProgress(month: string, today: string): number {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (today < `${month}-01`) return 0;
  if (today.slice(0, 7) > month) return 1;
  return Number(today.slice(8, 10)) / days;
}

/** Spending faster than the calendar: more than 10 points ahead of the month's progress. */
export function aheadOfPace(l: BudgetLine, progress: number): boolean {
  return l.level === "ok" && l.budget > 0 && l.percent > progress * 100 + 10;
}
