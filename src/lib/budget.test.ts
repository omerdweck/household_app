import { describe, expect, it } from "vitest";
import { aheadOfPace, budgetLines, levelFor, monthProgress, type BudgetRow } from "./budget";
import type { ExpenseRow } from "./stats";
import type { Category } from "./types";

const ME = "me";
const HER = "her";
const members = [
  { id: ME, display_name: "עומר" },
  { id: HER, display_name: "נועה" },
];
const cats: Category[] = [
  { id: "bills", name: "חשבונות", parent_id: null, default_tag: "apartment", sort_order: 1 },
  { id: "elec", name: "חשמל", parent_id: "bills", default_tag: "apartment", sort_order: 1 },
  { id: "food", name: "אוכל בחוץ", parent_id: null, default_tag: "personal", sort_order: 2 },
];

const e = (amount: number, tag: ExpenseRow["tag"], category_id: string | null, splits: [string, number][]): ExpenseRow => ({
  date: "2026-11-05",
  amount,
  paid_by: splits[0][0],
  tag,
  category_id,
  transaction_splits: splits.map(([member_id, a]) => ({ member_id, amount: a })),
});

const expenses = [
  e(5200, "apartment", null, [[ME, 2600], [HER, 2600]]), // rent
  e(300, "apartment", "elec", [[ME, 150], [HER, 150]]),  // electricity
  e(240, "personal", "food", [[ME, 240]]),               // my dinner
  e(90, null, "food", [[HER, 60], [ME, 30]]),            // not tagged yet → counts as personal
];

const b = (member_id: string | null, category_id: string | null, amount: number): BudgetRow => ({
  id: `${member_id}-${category_id}`,
  month: "2026-11-01",
  member_id,
  category_id,
  amount,
});

describe("budgetLines", () => {
  const lines = budgetLines(
    expenses,
    [b(null, null, 6000), b(ME, null, 300), b(HER, null, 1000), b(null, "bills", 300), b(null, "food", 500)],
    cats,
    members,
  );
  const get = (key: string) => lines.find((l) => l.key === key)!;

  it("shared pot counts every apartment expense in full", () => {
    expect(get("shared")).toMatchObject({ spent: 5500, budget: 6000, remaining: 500, percent: 92, level: "warning" });
  });

  it("personal counts each one's share of personal and untagged expenses", () => {
    expect(get("member-me")).toMatchObject({ spent: 270, percent: 90, level: "warning" });
    expect(get("member-her")).toMatchObject({ spent: 60, percent: 6, level: "ok" });
  });

  it("a cap on a parent category includes its children", () => {
    expect(get("cat-bills")).toMatchObject({ spent: 300, percent: 100, level: "over", remaining: 0 });
  });

  it("category caps count both partners together", () => {
    expect(get("cat-food")).toMatchObject({ spent: 330, percent: 66 });
  });

  it("only lists budgets that were set", () => {
    expect(budgetLines(expenses, [b(ME, null, 100)], cats, members).map((l) => l.key)).toEqual(["member-me"]);
  });

  it("a zero budget with spending is over, not divide-by-zero", () => {
    expect(budgetLines(expenses, [b(ME, null, 0)], cats, members)[0]).toMatchObject({ percent: 100, level: "over" });
  });
});

describe("levels and pace", () => {
  it("warns at 80% and flags over at 100%", () => {
    expect([levelFor(79), levelFor(80), levelFor(99), levelFor(100)]).toEqual(["ok", "warning", "warning", "over"]);
  });

  it("knows how far into the month we are", () => {
    expect(monthProgress("2026-11", "2026-11-15")).toBe(0.5);
    expect(monthProgress("2026-11", "2026-12-03")).toBe(1);
    expect(monthProgress("2026-11", "2026-10-30")).toBe(0);
  });

  it("flags spending well ahead of the calendar", () => {
    const l = { level: "ok", budget: 1000, percent: 65 } as Parameters<typeof aheadOfPace>[0];
    expect(aheadOfPace(l, 0.33)).toBe(true); // 65% spent on the 10th
    expect(aheadOfPace(l, 0.9)).toBe(false); // 65% spent on the 27th
  });
});
