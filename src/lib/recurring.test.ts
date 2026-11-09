import { describe, expect, it } from "vitest";
import {
  cycleStatus,
  detectRecurring,
  dueDate,
  guessKind,
  historyOf,
  monthlyEquivalent,
  type ChargeRow,
  type RecurringItem,
} from "./recurring";

const r = (date: string, amount: number, key: string, extra: Partial<ChargeRow> = {}): ChargeRow => ({
  date,
  amount,
  merchant: key,
  merchant_key: key,
  category_id: null,
  tag: null,
  ...extra,
});

const TODAY = "2026-11-09";

const history: ChargeRow[] = [
  // rent by cheque, monthly, same amount
  ...["06", "07", "08", "09", "10", "11"].map((m) => r(`2026-${m}-01`, 5200, "שיק", { tag: "apartment" })),
  // electricity every two months, amount varies by season
  r("2026-05-14", 310, "חברת החשמל"),
  r("2026-07-15", 455, "חברת החשמל"),
  r("2026-09-13", 420, "חברת החשמל", { tag: "apartment" }),
  // streaming subscription, monthly, small
  ...["07", "08", "09", "10"].map((m) => r(`2026-${m}-03`, 54.9, "נטפליקס", { tag: "personal" })),
  // a café: many times a month — NOT a fixed cost
  ...["08", "09", "10"].flatMap((m) => [r(`2026-${m}-02`, 18, "קפה לנדוור"), r(`2026-${m}-16`, 22, "קפה לנדוור")]),
  // a gym that was cancelled in June — no longer running
  ...["03", "04", "05", "06"].map((m) => r(`2026-${m}-10`, 199, "הולמס פלייס")),
  // supermarket monthly but amounts all over the place
  r("2026-08-05", 120, "שופרסל"),
  r("2026-09-05", 890, "שופרסל"),
  r("2026-10-05", 430, "שופרסל"),
  // a one-off
  r("2026-10-20", 1200, "איקאה"),
  // a refund never counts as a charge
  r("2026-10-21", -54.9, "נטפליקס"),
];

describe("detectRecurring", () => {
  const found = detectRecurring(history, TODAY);
  const keys = found.map((s) => s.merchantKey);

  it("finds monthly rent, bimonthly electricity and the subscription", () => {
    expect(keys).toEqual(["שיק", "חברת החשמל", "נטפליקס"]); // biggest first
  });

  it("reads the schedule and a typical amount", () => {
    const elec = found.find((s) => s.merchantKey === "חברת החשמל")!;
    expect(elec).toMatchObject({ periodMonths: 2, dayOfMonth: 14, typicalAmount: 420, occurrences: 3 });
    expect(found[0]).toMatchObject({ periodMonths: 1, dayOfMonth: 1, typicalAmount: 5200, tag: "apartment" });
  });

  it("ignores a café visited several times a month", () => {
    expect(keys).not.toContain("קפה לנדוור");
  });

  it("ignores a subscription that stopped months ago", () => {
    expect(keys).not.toContain("הולמס פלייס");
  });

  it("ignores monthly shopping whose amount swings widely", () => {
    expect(keys).not.toContain("שופרסל");
  });

  it("ignores one-offs and needs at least 3 charges", () => {
    expect(keys).not.toContain("איקאה");
    expect(detectRecurring(history.filter((x) => x.merchant_key === "חברת החשמל").slice(1), TODAY)).toEqual([]);
  });

  it("guesses a kind the user can change", () => {
    expect(guessKind(found[0])).toBe("bill"); // apartment
    expect(guessKind({ tag: "personal", typicalAmount: 54.9, periodMonths: 1 })).toBe("subscription");
    expect(guessKind({ tag: null, typicalAmount: 807.8, periodMonths: 1 })).toBe("standing_order");
  });
});

const item = (over: Partial<RecurringItem>): RecurringItem => ({
  id: "i",
  merchant_pattern: "שיק",
  label: "שכר דירה",
  expected_amount: 5200,
  day_of_month: 1,
  period_months: 1,
  kind: "bill",
  tag: "apartment",
  is_active: true,
  ...over,
});

describe("cycleStatus", () => {
  it("is paid when this month's charge is in", () => {
    expect(cycleStatus(item({}), history, TODAY)).toEqual({ state: "paid", date: "2026-11-01", amount: 5200 });
  });

  it("a bimonthly bill paid last month still counts as paid", () => {
    const elec = item({ merchant_pattern: "חברת החשמל", day_of_month: 14, period_months: 2 });
    expect(cycleStatus(elec, history, "2026-10-20").state).toBe("paid");
  });

  it("is upcoming before the due day", () => {
    const elec = item({ merchant_pattern: "חברת החשמל", day_of_month: 14, period_months: 2 });
    expect(cycleStatus(elec, history, TODAY)).toEqual({ state: "upcoming", due: "2026-11-14" });
  });

  it("is due within the 5-day grace period, then missing", () => {
    const sub = item({ merchant_pattern: "נטפליקס", day_of_month: 3 });
    expect(cycleStatus(sub, history, "2026-11-06")).toEqual({ state: "due", due: "2026-11-03" });
    expect(cycleStatus(sub, history, TODAY)).toEqual({ state: "missing", due: "2026-11-03" });
  });

  it("does not count a refund as this cycle's payment", () => {
    const sub = item({ merchant_pattern: "נטפליקס", day_of_month: 3 });
    expect(cycleStatus(sub, history, TODAY).state).not.toBe("paid");
  });

  it("handles day 31 in a short month", () => {
    expect(dueDate("2026-11", 31)).toBe("2026-11-30");
    expect(dueDate("2026-02", 30)).toBe("2026-02-28");
  });
});

describe("totals and history", () => {
  it("spreads a bimonthly bill over two months", () => {
    expect(monthlyEquivalent({ expected_amount: 420, period_months: 2 })).toBe(210);
    expect(monthlyEquivalent({ expected_amount: 54.9, period_months: 1 })).toBe(54.9);
  });

  it("lists past charges newest first, without refunds", () => {
    const h = historyOf(item({ merchant_pattern: "נטפליקס" }), history);
    expect(h[0]).toEqual({ date: "2026-10-03", amount: 54.9 });
    expect(h.every((x) => x.amount > 0)).toBe(true);
  });
});
