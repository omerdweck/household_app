"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getHousehold } from "@/lib/household";
import { isMonth, shiftMonth } from "@/lib/dates";
import { parseAmount } from "@/lib/money";

export type BudgetState = { error?: string; ok?: boolean };

function refresh() {
  revalidatePath("/budget");
  revalidatePath("/");
}

/** One input: shared pot, my personal budget, or a category cap. Empty clears it. */
export async function saveBudget(
  month: string,
  target: { memberId: string | null; categoryId: string | null },
  raw: string,
): Promise<BudgetState> {
  const { me } = await getHousehold();
  if (!isMonth(month)) return { error: "חודש לא תקין" };
  if (target.memberId && target.memberId !== me.id) return { error: "אפשר לקבוע רק את התקציב האישי שלך" };

  const trimmed = raw.trim();
  const amount = trimmed === "" ? null : parseAmount(trimmed);
  if (trimmed !== "" && (amount === null || amount < 0)) return { error: "סכום לא תקין" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_budget", {
    p_month: `${month}-01`,
    p_member_id: target.memberId,
    p_category_id: target.categoryId,
    p_amount: amount,
  });
  if (error) return { error: "השמירה נכשלה" };
  refresh();
  return { ok: true };
}

export async function copyPreviousMonth(month: string) {
  await getHousehold();
  if (!isMonth(month)) return;
  const supabase = await createClient();
  await supabase.rpc("copy_budgets", { p_from: `${shiftMonth(month, -1)}-01`, p_to: `${month}-01` });
  refresh();
}
