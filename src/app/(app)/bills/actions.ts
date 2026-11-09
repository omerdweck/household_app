"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getHousehold } from "@/lib/household";
import { parseAmount } from "@/lib/money";
import type { RecurringItem } from "@/lib/recurring";
import type { Tag } from "@/lib/types";

export type ActionState = { error?: string; ok?: boolean };

const KINDS: RecurringItem["kind"][] = ["bill", "standing_order", "subscription"];
const PERIODS = [1, 2, 3, 12];

function refresh() {
  revalidatePath("/bills");
  revalidatePath("/");
}

type Input = {
  merchantKey: string;
  label: string;
  amount: number | null;
  day: number | null;
  period: number;
  kind: RecurringItem["kind"];
  tag: Tag | null;
  categoryId: string | null;
};

function valid(i: Input): string | null {
  if (!i.merchantKey.trim()) return "חסר בית עסק";
  if (!i.label.trim() || i.label.length > 80) return "חסר שם";
  if (i.amount !== null && (!Number.isFinite(i.amount) || i.amount < 0)) return "סכום לא תקין";
  if (i.day !== null && (i.day < 1 || i.day > 31)) return "יום בחודש בין 1 ל-31";
  if (!PERIODS.includes(i.period)) return "תדירות לא תקינה";
  if (!KINDS.includes(i.kind)) return "סוג לא תקין";
  return null;
}

async function upsert(i: Input, active: boolean) {
  const { me } = await getHousehold();
  const supabase = await createClient();
  return supabase.from("recurring").upsert(
    {
      merchant_pattern: i.merchantKey,
      label: i.label.trim(),
      expected_amount: i.amount,
      day_of_month: i.day,
      period_months: i.period,
      kind: i.kind,
      tag: i.tag,
      category_id: i.categoryId,
      is_active: active,
      created_by: me.id,
    },
    { onConflict: "merchant_pattern" },
  );
}

/** "הוספה" on a suggestion. */
export async function confirmSuggestion(i: Input): Promise<ActionState> {
  const err = valid(i);
  if (err) return { error: err };
  const { error } = await upsert(i, true);
  if (error) return { error: "השמירה נכשלה" };
  refresh();
  return { ok: true };
}

/** "התעלמות": remembered, so it is not suggested again. */
export async function dismissSuggestion(i: Input): Promise<ActionState> {
  const { error } = await upsert({ ...i, label: i.label || i.merchantKey }, false);
  if (error) return { error: "השמירה נכשלה" };
  refresh();
  return { ok: true };
}

/** Edit form on an existing fixed cost (and the manual "add" form). */
export async function saveItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await getHousehold();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const dayRaw = String(formData.get("day") ?? "").trim();
  const tagRaw = String(formData.get("tag") ?? "");
  const input: Input = {
    merchantKey: String(formData.get("merchant_key") ?? ""),
    label: String(formData.get("label") ?? ""),
    amount: amountRaw ? parseAmount(amountRaw) : null,
    day: dayRaw ? Number(dayRaw) : null,
    period: Number(formData.get("period") ?? 1),
    kind: String(formData.get("kind") ?? "bill") as RecurringItem["kind"],
    tag: tagRaw === "apartment" || tagRaw === "personal" ? tagRaw : null,
    categoryId: String(formData.get("category_id") ?? "") || null,
  };
  if (amountRaw && input.amount === null) return { error: "סכום לא תקין" };
  const err = valid(input);
  if (err) return { error: err };
  const { error } = await upsert(input, true);
  if (error) return { error: "השמירה נכשלה" };
  refresh();
  return { ok: true };
}

/** Stop tracking a fixed cost (kept as dismissed so it is not suggested again). */
export async function stopTracking(id: string) {
  await getHousehold();
  const supabase = await createClient();
  await supabase.from("recurring").update({ is_active: false }).eq("id", id);
  refresh();
}
