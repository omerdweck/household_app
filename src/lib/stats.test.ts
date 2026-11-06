import { describe, expect, it } from "vitest";
import { monthlyTrend, percentChange, summarizeMonth, type ExpenseRow } from "./stats";
import type { Category } from "./types";

const ME = "me";
const HER = "her";
const MEMBERS = [ME, HER];

const cats: Category[] = [
  { id: "home", name: "דיור", parent_id: null, default_tag: "apartment", sort_order: 1 },
  { id: "rent", name: "שכר דירה", parent_id: "home", default_tag: "apartment", sort_order: 1 },
  { id: "bills", name: "חשבונות", parent_id: null, default_tag: "apartment", sort_order: 2 },
  { id: "elec", name: "חשמל", parent_id: "bills", default_tag: "apartment", sort_order: 1 },
  { id: "food", name: "אוכל בחוץ", parent_id: null, default_tag: "personal", sort_order: 3 },
];

const row = (r: Partial<ExpenseRow> & Pick<ExpenseRow, "amount" | "paid_by" | "transaction_splits">): ExpenseRow => ({
  date: "2026-11-05",
  tag: null,
  category_id: null,
  ...r,
});

// The rent example: I paid 5200, split equally. She paid electricity 300, split 60/40.
// I had coffee alone.
const rows: ExpenseRow[] = [
  row({ amount: 5200, paid_by: ME, tag: "apartment", category_id: "rent",
        transaction_splits: [{ member_id: ME, amount: 2600 }, { member_id: HER, amount: 2600 }] }),
  row({ amount: 300, paid_by: HER, tag: "apartment", category_id: "elec",
        transaction_splits: [{ member_id: ME, amount: 180 }, { member_id: HER, amount: 120 }] }),
  row({ amount: 18.9, paid_by: ME, tag: "personal", category_id: "food",
        transaction_splits: [{ member_id: ME, amount: 18.9 }] }),
];

describe("summarizeMonth", () => {
  const s = summarizeMonth(rows, cats, MEMBERS, ME);

  it("totals everything once", () => {
    expect(s.total).toBe(5518.9);
    expect(s.count).toBe(3);
  });

  it("separates what each one paid from what each one carries", () => {
    expect(s.paid).toEqual({ me: 5218.9, her: 300 });
    expect(s.carried).toEqual({ me: 2798.9, her: 2720 });
  });

  it("works out who owes whom: she owes me her 2600 rent share minus my 180 electricity share", () => {
    expect(s.balance).toBe(2420);
  });

  it("is the same balance seen from her side, with the sign flipped", () => {
    expect(summarizeMonth(rows, cats, MEMBERS, HER).balance).toBe(-2420);
  });

  it("splits apartment and personal per member", () => {
    expect(s.apartment).toEqual({ me: 2780, her: 2720 });
    expect(s.personal).toEqual({ me: 18.9, her: 0 });
  });

  it("rolls child categories up to the parent, largest first", () => {
    expect(s.byCategory.map((c) => [c.name, c.total])).toEqual([
      ["דיור", 5200],
      ["חשבונות", 300],
      ["אוכל בחוץ", 18.9],
    ]);
    expect(s.byCategory[1].byMember).toEqual({ me: 180, her: 120 });
  });

  it("folds the tail into 'אחר' and keeps the total", () => {
    const folded = summarizeMonth(rows, cats, MEMBERS, ME, 1);
    expect(folded.byCategory.map((c) => c.name)).toEqual(["דיור", "אחר"]);
    expect(folded.byCategory.reduce((a, c) => a + c.total, 0)).toBeCloseTo(s.total, 2);
  });

  it("counts uncategorized and untagged rows instead of dropping them", () => {
    const s2 = summarizeMonth(
      [row({ amount: 50, paid_by: ME, transaction_splits: [{ member_id: ME, amount: 50 }] })],
      cats, MEMBERS, ME,
    );
    expect(s2.byCategory[0].name).toBe("ללא קטגוריה");
    expect(s2.untagged).toBe(50);
  });

  it("does not drift on agorot", () => {
    const many = Array.from({ length: 10 }, () =>
      row({ amount: 0.1, paid_by: ME, transaction_splits: [{ member_id: ME, amount: 0.1 }] }));
    expect(summarizeMonth(many, cats, MEMBERS, ME).total).toBe(1);
  });
});

describe("monthlyTrend", () => {
  it("returns every month asked for, oldest first, zeros included", () => {
    const t = monthlyTrend(
      [...rows, row({ date: "2026-09-10", amount: 100, paid_by: HER, transaction_splits: [{ member_id: HER, amount: 100 }] })],
      ["2026-09", "2026-10", "2026-11"],
      MEMBERS,
    );
    expect(t.map((p) => [p.month, p.total])).toEqual([
      ["2026-09", 100],
      ["2026-10", 0],
      ["2026-11", 5518.9],
    ]);
    expect(t[2].byMember).toEqual({ me: 2798.9, her: 2720 });
  });
});

describe("percentChange", () => {
  it("compares with last month", () => {
    expect(percentChange(1100, 1000)).toBe(10);
    expect(percentChange(900, 1000)).toBe(-10);
    expect(percentChange(500, 0)).toBeNull();
  });
});
