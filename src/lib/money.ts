// Money helpers. All arithmetic happens in integer agorot (cents) so that
// 0.1 + 0.2 style floating-point errors can never make a split total wrong.

export type Split = { member_id: string; amount: number };

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
});

export function formatILS(amount: number): string {
  return ils.format(amount);
}

/** Parse what a user typed ("1,250.5", "₪ 45", "-30") into a number, or null. */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[₪,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/**
 * "חלק שווה": half each. When the total has an odd number of agorot,
 * the payer carries the extra one, so the two halves always add up exactly.
 */
export function equalSplit(amount: number, payerId: string, otherId: string): Split[] {
  const total = toCents(amount);
  const other = Math.trunc(total / 2);
  const payer = total - other;
  return [
    { member_id: payerId, amount: fromCents(payer) },
    { member_id: otherId, amount: fromCents(other) },
  ];
}

/** Everything on one member. */
export function allOn(amount: number, memberId: string): Split[] {
  return [{ member_id: memberId, amount }];
}

/**
 * Keep the same proportions when the amount changes
 * (e.g. 2600/2600 of 5200 → 2750/2750 of 5500).
 * Rounding leftovers go to the payer so the total is always exact.
 */
export function rescaleSplits(splits: Split[], newAmount: number, payerId: string): Split[] {
  const newTotal = toCents(newAmount);
  const oldTotal = splits.reduce((s, x) => s + toCents(x.amount), 0);

  if (splits.length === 0 || oldTotal === 0) return allOn(newAmount, payerId);

  const scaled = splits.map((s) => ({
    member_id: s.member_id,
    cents: Math.round((toCents(s.amount) * newTotal) / oldTotal),
  }));
  const diff = newTotal - scaled.reduce((s, x) => s + x.cents, 0);
  const target = scaled.find((s) => s.member_id === payerId) ?? scaled[0];
  target.cents += diff;

  return scaled.map((s) => ({ member_id: s.member_id, amount: fromCents(s.cents) }));
}

/** Splits for a custom "עריכת חלוקה" entry given as percent for one member. */
export function percentSplit(
  amount: number,
  memberId: string,
  percent: number,
  otherId: string,
): Split[] {
  const total = toCents(amount);
  const mine = Math.round((total * percent) / 100);
  return [
    { member_id: memberId, amount: fromCents(mine) },
    { member_id: otherId, amount: fromCents(total - mine) },
  ];
}

export function splitsMatch(splits: Split[], amount: number): boolean {
  return splits.reduce((s, x) => s + toCents(x.amount), 0) === toCents(amount);
}

/** Short human label for a split, from the viewer's side. */
export function describeSplit(splits: Split[], amount: number, meId: string): string {
  const nonZero = splits.filter((s) => s.amount !== 0);
  if (nonZero.length <= 1) return "";
  const mine = nonZero.find((s) => s.member_id === meId)?.amount ?? 0;
  const pct = amount === 0 ? 0 : Math.round((mine / amount) * 100);
  return pct === 50 ? "חולק שווה" : `חלקך ${pct}%`;
}
