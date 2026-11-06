// Decide what each imported row IS, so nothing is counted twice.
import type { TxKind } from "@/lib/types";
import type { ParsedRow } from "./parse";
import { normalizeMerchant } from "./normalize";

// Card charges as they appear on the BANK statement. The card's own export
// already itemizes these purchases, so the bank line is not counted again:
//  * "מקס איט פיננ-י" — the monthly Max bill and Max foreign-currency charges
//  * "לאומי דביט"     — each Leumi debit-card purchase; Max issues that card and lists
//                        every one on its "עסקאות בחיוב מיידי" sheet (verified on a real
//                        export: 41 of 41 rows matched by amount and charge date)
// Deliberately specific: "מקסטוק" (a store) must not match "מקס", and the debit-card
// FEE ("דמי כרטיס דביט") is a real expense.
const CARD_BILL =
  /מקס איט|max it|מקס פיננסים|ישראכרט|כאל|כרטיסי אשראי|לאומי קארד|אמריקן אקספרס|דיינרס|ויזה כאל|isracard|לאומי דביט|דיסקונט דביט/i;
const NOT_A_CHARGE = /דמי|עמלה/;

// Money in that is not income: a loan being paid out to you.
const LOAN_IN = /העמדת הלו?אה|הלוואה חדשה|קבלת הלוואה/;

export function classifyKind(row: ParsedRow, accountType: "bank" | "credit_card"): TxKind {
  if (accountType === "bank") {
    if (!row.isCredit && CARD_BILL.test(row.merchant) && !NOT_A_CHARGE.test(row.merchant)) return "card_bill";
    if (row.isCredit) return LOAN_IN.test(row.merchant) ? "internal_transfer" : "income";
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
// The list covers every category seen in a real Max export (2026-09/10).
const CARD_CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/מסעד|קפה|ברים|מזון מהיר/, "אוכל בחוץ"], // before "מזון", or restaurants would become groceries
  [/מזון|סופר|מכולת/, "סופר"],
  [/דלק/, "דלק"], // "דלק, חשמל וגז"
  [/תחבורה|רכב|חניה/, "תחבורה"],
  [/אופנה|ביגוד|הנעלה/, "ביגוד"],
  [/רפואה|מרקחת|בריאות/, "בריאות"],
  [/קוסמטיקה|טיפוח/, "טיפוח"],
  [/ביטוח/, "ביטוח"],
  [/פנאי|בידור|ספורט|תרבות/, "בילויים"],
  [/ריהוט|בית וגן|לבית|חשמל ומחשבים/, "ציוד לבית"],
  [/טיס|תיירות|מלונ|נופש/, "חופשות"],
  [/תקשורת|סלולר/, "אינטרנט"],
  [/עירייה|ממשלה/, "חשבונות"],
  [/העברת כספים/, "העברות"],
  [/חינוך|לימוד/, "לימודים"],
  [/מתנות|צעצוע/, "מתנות"],
];

export function mapCardCategory(cardCategory: string | null): string | null {
  if (!cardCategory) return null;
  return CARD_CATEGORY_KEYWORDS.find(([re]) => re.test(cardCategory))?.[1] ?? null;
}

// Bank statement lines carry no category, only a short description.
const BANK_DESCRIPTION_KEYWORDS: [RegExp, string][] = [
  [/פרעון הלוו?אה|החזר הלוו?אה/, "הלוואות"],
  [/דמי כרטיס|עמלה|דמי ניהול/, "עמלות ובנק"],
  [/ביטוח לאומי/, "ביטוח"],
  [/אוניברסיט|מכללה|שכר לימוד/, "לימודים"],
];

export function mapBankDescription(description: string): string | null {
  return BANK_DESCRIPTION_KEYWORDS.find(([re]) => re.test(description))?.[1] ?? null;
}
