"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getHousehold } from "@/lib/household";
import { allOn, equalSplit, parseAmount, rescaleSplits, splitsMatch, type Split } from "@/lib/money";
import type { Tag, TxKind } from "@/lib/types";

export type FormState = { error?: string };

const KINDS: TxKind[] = ["expense", "card_bill", "internal_transfer", "settlement", "income"];

type Fields = {
  date: string;
  amount: number;
  merchant: string;
  category_id: string | null;
  tag: Tag | null;
  paid_by: string;
  account_id: string | null;
  kind: TxKind;
  notes: string | null;
};

/** Read and validate the shared add/edit form. */
function readFields(formData: FormData, memberIds: string[]): Fields | { error: string } {
  const amount = parseAmount(String(formData.get("amount") ?? ""));
  if (amount === null || amount === 0) return { error: "סכום לא תקין" };

  const merchant = String(formData.get("merchant") ?? "").trim();
  if (!merchant) return { error: "חסר תיאור / בית עסק" };

  const date = String(formData.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "תאריך לא תקין" };

  const paid_by = String(formData.get("paid_by") ?? "");
  if (!memberIds.includes(paid_by)) return { error: "מי שילם?" };

  const tagRaw = String(formData.get("tag") ?? "");
  const tag: Tag | null = tagRaw === "apartment" || tagRaw === "personal" ? tagRaw : null;

  const kindRaw = String(formData.get("kind") ?? "expense") as TxKind;
  const kind = KINDS.includes(kindRaw) ? kindRaw : "expense";

  return {
    date,
    amount,
    merchant,
    paid_by,
    tag,
    kind,
    category_id: String(formData.get("category_id") ?? "") || null,
    account_id: String(formData.get("account_id") ?? "") || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

function dbError(message: string): string {
  if (message.includes("Splits for transaction")) return "החלוקה לא מסתכמת בסכום ההוצאה";
  return "השמירה נכשלה. נסו שוב.";
}

export async function createTransaction(_prev: FormState, formData: FormData): Promise<FormState> {
  const h = await getHousehold();
  const f = readFields(formData, h.members.map((m) => m.id));
  if ("error" in f) return f;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .insert({ ...f, source: "manual", status: "completed" })
    .select("id")
    .single();
  if (error || !data) return { error: dbError(error?.message ?? "") };

  // The DB already created "100% on the payer". Apply the chosen preset if it differs.
  const preset = String(formData.get("split") ?? "payer");
  const other = h.members.find((m) => m.id !== f.paid_by);
  if (f.kind === "expense" && other && preset !== "payer") {
    const splits = preset === "equal" ? equalSplit(f.amount, f.paid_by, other.id) : allOn(f.amount, other.id);
    const { error: e2 } = await supabase.rpc("set_transaction_splits", {
      p_transaction_id: data.id,
      p_splits: splits,
    });
    if (e2) return { error: dbError(e2.message) };
  }

  revalidatePath("/transactions");
  redirect(`/transactions?month=${f.date.slice(0, 7)}`);
}

export async function updateTransaction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const h = await getHousehold();
  const f = readFields(formData, h.members.map((m) => m.id));
  if ("error" in f) return f;

  const supabase = await createClient();
  const { data: current, error: readErr } = await supabase
    .from("transactions")
    .select("amount, paid_by, kind, source, transaction_splits(member_id, amount)")
    .eq("id", id)
    .single();
  if (readErr || !current) return { error: "ההוצאה לא נמצאה" };

  const oldSplits = (current.transaction_splits ?? []) as Split[];

  // Work out what the splits must become so the DB total check passes.
  let splits: Split[] | null = null;
  if (f.kind !== "expense") {
    splits = []; // not an expense → nobody carries it
  } else if (current.kind !== "expense" || oldSplits.length === 0) {
    splits = allOn(f.amount, f.paid_by);
  } else if (f.amount !== current.amount || f.paid_by !== current.paid_by) {
    const wasAllOnPayer = oldSplits.length === 1 && oldSplits[0].member_id === current.paid_by;
    splits = wasAllOnPayer ? allOn(f.amount, f.paid_by) : rescaleSplits(oldSplits, f.amount, f.paid_by);
  }

  // Imported rows keep their source facts; only manual rows may change account.
  const patch: Record<string, unknown> = {
    date: f.date,
    amount: f.amount,
    merchant: f.merchant,
    category_id: f.category_id,
    tag: f.tag,
    paid_by: f.paid_by,
    kind: f.kind,
    notes: f.notes,
  };

  const { error } = await supabase.rpc("update_transaction", {
    p_id: id,
    p_patch: patch,
    p_splits: splits,
  });
  if (error) return { error: dbError(error.message) };

  if (current.source === "manual" && f.account_id !== undefined) {
    await supabase.from("transactions").update({ account_id: f.account_id }).eq("id", id);
  }

  revalidatePath("/transactions");
  redirect(`/transactions?month=${f.date.slice(0, 7)}`);
}

/** "חלק שווה", "הכל עליי", custom amounts — replaces the splits in one call. */
export async function saveSplits(id: string, splits: Split[]): Promise<FormState> {
  await getHousehold();
  const supabase = await createClient();

  const { data: tx } = await supabase.from("transactions").select("amount").eq("id", id).single();
  if (!tx) return { error: "ההוצאה לא נמצאה" };
  if (!splitsMatch(splits, tx.amount)) return { error: "החלוקה לא מסתכמת בסכום ההוצאה" };

  const { error } = await supabase.rpc("set_transaction_splits", {
    p_transaction_id: id,
    p_splits: splits,
  });
  if (error) return { error: dbError(error.message) };

  revalidatePath("/transactions");
  revalidatePath(`/transactions/${id}`);
  return {};
}

export async function deleteTransaction(id: string) {
  await getHousehold();
  const supabase = await createClient();
  // Only manually added rows can be deleted; imported ones would come back on the next import.
  const { data } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id)
    .eq("source", "manual")
    .select("date")
    .single();
  revalidatePath("/transactions");
  redirect(data ? `/transactions?month=${data.date.slice(0, 7)}` : "/transactions");
}
