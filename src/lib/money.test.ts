import { describe, expect, it } from "vitest";
import {
  allOn,
  describeSplit,
  equalSplit,
  parseAmount,
  percentSplit,
  rescaleSplits,
  splitsMatch,
} from "./money";

const OMER = "omer";
const PARTNER = "partner";

describe("equalSplit", () => {
  it("splits rent 5200 into 2600 / 2600", () => {
    expect(equalSplit(5200, OMER, PARTNER)).toEqual([
      { member_id: OMER, amount: 2600 },
      { member_id: PARTNER, amount: 2600 },
    ]);
  });

  it("gives the odd agora to the payer so the total stays exact", () => {
    const s = equalSplit(45.91, OMER, PARTNER);
    expect(s).toEqual([
      { member_id: OMER, amount: 22.96 },
      { member_id: PARTNER, amount: 22.95 },
    ]);
    expect(splitsMatch(s, 45.91)).toBe(true);
  });

  it("works for refunds (negative amounts)", () => {
    const s = equalSplit(-99.99, OMER, PARTNER);
    expect(splitsMatch(s, -99.99)).toBe(true);
  });

  it("never drifts on amounts that are tricky in floating point", () => {
    for (const a of [0.1, 0.3, 19.99, 33.33, 1234.57, 0.01]) {
      expect(splitsMatch(equalSplit(a, OMER, PARTNER), a)).toBe(true);
    }
  });
});

describe("rescaleSplits", () => {
  it("keeps 50/50 when the amount changes", () => {
    expect(rescaleSplits(equalSplit(5200, OMER, PARTNER), 5500, OMER)).toEqual([
      { member_id: OMER, amount: 2750 },
      { member_id: PARTNER, amount: 2750 },
    ]);
  });

  it("keeps a 70/30 split proportional and exact", () => {
    const s = rescaleSplits(
      [
        { member_id: OMER, amount: 70 },
        { member_id: PARTNER, amount: 30 },
      ],
      33.33,
      OMER,
    );
    expect(splitsMatch(s, 33.33)).toBe(true);
    expect(s.find((x) => x.member_id === PARTNER)?.amount).toBe(10);
  });

  it("falls back to 100% on the payer when there were no splits", () => {
    expect(rescaleSplits([], 80, OMER)).toEqual(allOn(80, OMER));
  });
});

describe("percentSplit", () => {
  it("gives the rest to the other member", () => {
    const s = percentSplit(300, OMER, 40, PARTNER);
    expect(s).toEqual([
      { member_id: OMER, amount: 120 },
      { member_id: PARTNER, amount: 180 },
    ]);
  });

  it("is exact even when the percent does not divide evenly", () => {
    expect(splitsMatch(percentSplit(100.01, OMER, 33, PARTNER), 100.01)).toBe(true);
  });
});

describe("parseAmount", () => {
  it.each([
    ["5200", 5200],
    ["1,250.50", 1250.5],
    ["₪ 45.9", 45.9],
    ["-30", -30],
  ])("parses %s", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(["", "abc", "12.345", "1.2.3"])("rejects %j", (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});

describe("describeSplit", () => {
  it("is empty for a single payer", () => {
    expect(describeSplit(allOn(100, OMER), 100, OMER)).toBe("");
  });

  it("says equal for 50/50", () => {
    expect(describeSplit(equalSplit(100, OMER, PARTNER), 100, OMER)).toBe("חולק שווה");
  });

  it("shows the viewer's share otherwise", () => {
    expect(describeSplit(percentSplit(100, OMER, 30, PARTNER), 100, OMER)).toBe("חלקך 30%");
  });
});
