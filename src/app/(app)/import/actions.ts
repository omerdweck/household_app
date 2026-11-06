"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getHousehold } from "@/lib/household";
import { classifyKind, fingerprints, mapBankDescription, mapCardCategory } from "@/lib/import/classify";
import { normalizeMerchant } from "@/lib/import/normalize";
import type { ParsedRow } from "@/lib/import/parse";
import type { Account, Category, Tag } from "@/lib/types";

export type ImportResult =
  | { ok: true; total: number; inserted: number; duplicates: number; cardBills: number; month: string }
  | { ok: false; error: string };

const MAX_ROWS = 5000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The browser parsed the file; here we re-check every row before it reaches the DB. */
function validRow(r: ParsedRow): boolean {
  return (
    typeof r === "object" &&
    r !== null &&
    DATE.test(r.date) &&
    (r.processedDate === null || DATE.test(r.processedDate)) &&
    typeof r.amount === "number" &&
    Number.isFinite(r.amount) &&
    Math.abs(r.amount) < 10_000_000 &&
    typeof r.merchant === "string" &&
    r.merchant.length > 0 &&
    r.merchant.length <= 300
  );
}

export async function importFile(accountId: string, fileName: string, rows: ParsedRow[]): Promise<ImportResult> {
  const { me } = await getHousehold();
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("accounts")
    .select("id, member_id, type, is_active")
    .eq("id", accountId)
    .maybeSingle<Pick<Account, "id" | "member_id" | "type" | "is_active">>();
  if (!account) return { ok: false, error: "החשבון לא נמצא" };
  if (account.member_id !== me.id) return { ok: false, error: "אפשר לייבא רק לחשבונות שלך" };

  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "לא נמצאו עסקאות בקובץ" };
  if (rows.length > MAX_ROWS) return { ok: false, error: `הקובץ גדול מדי (מעל ${MAX_ROWS} שורות). ייבאו חודש-חודש.` };
  if (!rows.every(validRow)) return { ok: false, error: "חלק מהשורות בקובץ לא תקינות" };

  // Category: (1) a rule learned from your own edits, (2) the card company's category.
  const [{ data: rules }, { data: categories }] = await Promise.all([
    supabase.from("category_rules").select("pattern, category_id, tag"),
    supabase.from("categories").select("id, name, parent_id, default_tag, sort_order"),
  ]);
  const ruleByKey = new Map((rules ?? []).map((r) => [r.pattern as string, r]));
  const cats = (categories ?? []) as Category[];
  const catByName = new Map(cats.map((c) => [c.name, c]));
  const parentTag = (c: Category) => c.default_tag ?? cats.find((p) => p.id === c.parent_id)?.default_tag ?? null;

  const hashes = await fingerprints(rows, accountId);

  const payload = rows.map((r, i) => {
    const kind = classifyKind(r, account.type);
    const key = normalizeMerchant(r.merchant);
    let category_id: string | null = null;
    let tag: Tag | null = null;

    if (kind === "expense") {
      const rule = ruleByKey.get(key);
      if (rule) {
        category_id = rule.category_id;
        tag = (rule.tag as Tag | null) ?? null;
      } else {
        const name = account.type === "bank" ? mapBankDescription(r.merchant) : mapCardCategory(r.cardCategory);
        const mapped = catByName.get(name ?? "");
        if (mapped) {
          category_id = mapped.id;
          tag = parentTag(mapped);
        }
      }
    }

    return {
      date: r.date,
      processed_date: r.processedDate,
      amount: r.amount,
      merchant: r.merchant,
      merchant_key: key,
      external_hash: hashes[i],
      kind,
      category_id,
      tag,
      original_amount: r.originalAmount,
      original_currency: r.originalCurrency,
      installment_number: r.installmentNumber,
      installment_total: r.installmentTotal,
      description: r.cardCategory,
    };
  });

  const { data, error } = await supabase.rpc("import_transactions", {
    p_account_id: accountId,
    p_file_name: fileName.slice(0, 200),
    p_rows: payload,
  });
  if (error || !data) return { ok: false, error: "הייבוא נכשל. נסו שוב." };

  revalidatePath("/transactions");
  revalidatePath("/import");

  const latest = rows.reduce((m, r) => (r.date > m ? r.date : m), rows[0].date);
  return {
    ok: true,
    total: data.total,
    inserted: data.inserted,
    duplicates: data.duplicates,
    cardBills: payload.filter((p) => p.kind === "card_bill").length,
    month: latest.slice(0, 7),
  };
}

/** "ביטול ייבוא": deletes the batch; the database removes its rows with it. */
export async function undoImport(batchId: string) {
  await getHousehold();
  const supabase = await createClient();
  await supabase.from("import_batches").delete().eq("id", batchId);
  revalidatePath("/import");
  revalidatePath("/transactions");
}
