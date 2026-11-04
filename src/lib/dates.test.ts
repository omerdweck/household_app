import { describe, expect, it } from "vitest";
import { isMonth, monthRange, shiftMonth } from "./dates";

describe("months", () => {
  it("shifts across year boundaries", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("builds a half-open range for queries", () => {
    expect(monthRange("2026-11")).toEqual({ start: "2026-11-01", end: "2026-12-01" });
    expect(monthRange("2026-12")).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });

  it("validates month strings from the URL", () => {
    expect(isMonth("2026-11")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("abc")).toBe(false);
    expect(isMonth(undefined)).toBe(false);
  });
});
