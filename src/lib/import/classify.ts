// Decide what each imported row IS, so nothing is counted twice.
import type { TxKind } from "@/lib/types";
import type { ParsedRow } from "./parse";
import { normalizeMerchant } from "./normalize";

// The monthly credit-card charge as it appears on the BANK statement.
// The card's own export already itemizes these purchases, so this line is not an expense.
// Deliberately specific: "מקסטוק" (a store) must not match "מקס".
const CARD_BILL = /מקס איט|max it|מקס פיננסים|ישראכרט|כאל|כרטיסי אשראי|לאומי קארד|אמריקן אקספרס|דיינרס|ויזה כאל|isracard/i;

export function classifyKind(row: ParsedRow, accountType: "bank" | "credit_card"): TxKind {
  if (accountType === "bank") {
    if (!row.isCredit && CARD_BILL.test(row.merchant)) return "card_bill";
    if (row.isCredit) return "income";
  }
  return "expense"; // card rows: purchases (> 0) and refunds (< 0) are both expenses
}

/**
 * Stable fingerprint for duplicate detection.
 * Two identical purchases on the same day (two coffees at 18 ₪) get occurrence 0 and 1,
 * so re-importing the same file never adds them again, and neither is lost.
 */
export async function fingerprints(rows: ParsedRow[], accountId: string): Promise<string[]> {
  const seen = new Map<string, number>();
  const out: string[] = [];
  for (const r of rows) {
    const key = [
      r.date,
      Math.round(r.amount * 100),
      normalizeMerchant(r.merchant),
      r.installmentNumber ?? "",
    ].join("|");
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    out.push(await sha256(`${accountId}|${key}|${n}`));
  }
  return out;
}

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

// The card company's category → our category name. Keyword based, so small wording
// changes still match. Unknown categories stay empty and get learned from your edits.
const CARD_CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/מזון|סופר|מכולת/, "סופר"],
  [/מסעד|קפה|ברים|מזון מהיר/, "אוכל בחוץ"],
  [/דלק/, "דלק"],
  [/תחבורה|רכב|חניה/, "תחבורה"],
  [/אופנה|ביגוד|הנעלה/, "ביגוד"],
  [/רפואה|מרקחת|בריאות/, "בריאות"],
  [/פנאי|בידור|ספורט|תרבות/, "בילויים"],
  [/ריהוט|בית וגן|לבית|חשמל ומחשבים/, "ציוד לבית"],
  [/טיס|תיירות|מלונ|נופש/, "חופשות"],
  [/תקשורת|סלולר/, "אינטרנט"],
  [/חינוך|לימוד/, "לימודים"],
  [/מתנות|צעצוע/, "מתנות"],
];

export function mapCardCategory(cardCategory: string | null): string | null {
  if (!cardCategory) return null;
  return CARD_CATEGORY_KEYWORDS.find(([re]) => re.test(cardCategory))?.[1] ?? null;
}
