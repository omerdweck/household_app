// Turn the rows of a bank / credit-card export into clean transactions.
//
// Israeli exports differ by bank and change from time to time, so instead of a
// fixed layout per bank we LOOK for the header row and match its columns by name.
// Everything here is pure: rows in, rows out — no database, easy to test.

import { normalizeHeader } from "./normalize";

export type Cell = string | number | boolean | Date | null | undefined;
export type SheetRows = { name: string; rows: Cell[][] };

export type ParsedRow = {
  date: string; // YYYY-MM-DD, the purchase day
  processedDate: string | null; // charge day on the card
  amount: number; // > 0 money out, < 0 money in
  merchant: string;
  originalAmount: number | null;
  originalCurrency: string | null; // ISO code when not ILS
  cardCategory: string | null; // the card company's own category, e.g. "מזון וצריכה"
  installmentNumber: number | null;
  installmentTotal: number | null;
  /** Bank statements only: true when money came in (a credit). */
  isCredit: boolean;
};

export type ParseResult = {
  rows: ParsedRow[];
  skipped: number;
  sheetsUsed: string[];
  warnings: string[];
};

type Field =
  | "date"
  | "processedDate"
  | "merchant"
  | "charge"
  | "amount"
  | "debit"
  | "credit"
  | "originalAmount"
  | "originalCurrency"
  | "category"
  | "type"
  | "notes";

// Header names seen in Israeli exports. Order matters: the first match wins,
// and more specific names come before generic ones ("סכום חיוב" before "סכום").
const SYNONYMS: [Field, string[]][] = [
  ["processedDate", ["תאריך חיוב", "מועד חיוב"]],
  ["date", ["תאריך עסקה", "תאריך רכישה", "תאריך העסקה", "תאריך"]],
  // "סוג תנועה" is Leumi's name for the description column
  ["merchant", ["שם בית העסק", "שם בית עסק", "בית העסק", "בית עסק", "תיאור התנועה", "תיאור", "סוג תנועה", "פרטים", "הפעולה"]],
  ["charge", ["סכום חיוב", "סכום החיוב", "סכום לחיוב"]],
  ["originalAmount", ["סכום עסקה מקורי", "סכום מקורי", "סכום העסקה", "סכום עסקה"]],
  ["originalCurrency", ["מטבע עסקה מקורי", "מטבע מקור", "מטבע עסקה"]],
  ["debit", ["בחובה", "חובה"]],
  ["credit", ["בזכות", "זכות"]],
  ["amount", ["סכום", "סכום בש״ח", "סכום בשח"]],
  ["category", ["קטגוריה", "ענף"]],
  ["type", ["סוג עסקה", "סוג העסקה"]],
  ["notes", ["הערות", "פירוט נוסף"]],
];

type Columns = Partial<Record<Field, number>>;

/** Find the header row and which column holds what. */
export function detectHeader(rows: Cell[][], scanRows = 40): { index: number; columns: Columns } | null {
  for (let i = 0; i < Math.min(rows.length, scanRows); i++) {
    const cells = rows[i].map(normalizeHeader);
    const columns: Columns = {};
    cells.forEach((cell, col) => {
      if (!cell) return;
      for (const [field, names] of SYNONYMS) {
        if (columns[field] !== undefined) continue;
        if (names.some((n) => normalizeHeader(n) === cell)) {
          columns[field] = col;
          return;
        }
      }
    });
    const hasMoney =
      columns.charge !== undefined ||
      columns.amount !== undefined ||
      columns.debit !== undefined ||
      columns.credit !== undefined;
    if (columns.date !== undefined && columns.merchant !== undefined && hasMoney) {
      return { index: i, columns };
    }
  }
  return null;
}

// ---------- cell parsing ----------

const pad = (n: number) => String(n).padStart(2, "0");

/** Dates arrive as Date objects, Excel serial numbers, or text in several formats. */
export function parseDate(cell: Cell): string | null {
  if (cell instanceof Date && !isNaN(cell.getTime())) {
    // SheetJS creates dates at local midnight; read local parts to keep the calendar day.
    return `${cell.getFullYear()}-${pad(cell.getMonth() + 1)}-${pad(cell.getDate())}`;
  }
  if (typeof cell === "number" && cell > 20000 && cell < 80000) {
    // Excel serial date (days since 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(cell) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof cell !== "string") return null;
  const s = cell.trim();

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);

  // Israeli order: day / month / year
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return valid(year, +m[2], +m[1]);
  }
  return null;
}

function valid(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** "1,234.50", "₪ -45", "(30.00)", 12.5 → number. Empty → null. */
export function parseMoney(cell: Cell): number | null {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  if (typeof cell !== "string") return null;
  let s = cell.trim();
  if (!s) return null;
  const parenNegative = /^\(.*\)$/.test(s);
  s = s.replace(/[₪$€,\s()]|ש״ח|ש"ח/g, "");
  // trailing minus ("45.00-") appears in some bank exports
  if (/^\d+(\.\d+)?-$/.test(s)) s = "-" + s.slice(0, -1);
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return parenNegative ? -Math.abs(n) : n;
}

export function parseCurrency(cell: Cell): string | null {
  const s = String(cell ?? "").trim();
  if (!s || /₪|ש״ח|ש"ח|ils|nis/i.test(s)) return null; // ILS is the default
  if (/\$|usd|דולר/i.test(s)) return "USD";
  if (/€|eur|אירו|יורו/i.test(s)) return "EUR";
  if (/£|gbp|ליש/i.test(s)) return "GBP";
  return /^[A-Z]{3}$/.test(s) ? s : null;
}

/** "תשלום 2 מתוך 3", "2 מתוך 3", "תשלום 2 מ-3" */
export function parseInstallment(...texts: Cell[]): { number: number; total: number } | null {
  for (const t of texts) {
    const m = String(t ?? "").match(/(\d+)\s*(?:מתוך|מ-|מ\s)\s*(\d+)/);
    if (m && +m[1] >= 1 && +m[2] >= +m[1]) return { number: +m[1], total: +m[2] };
  }
  return null;
}

const SUMMARY_ROW = /סה״כ|סה"כ|סך הכל|יתרה לסוף|total/i;

/**
 * Tidy a merchant name for display (the fingerprint uses normalizeMerchant separately):
 *  * drop invisible direction marks that PDF / HTML exports leave in Hebrew text
 *  * collapse runs of spaces ("ANTHROPIC              ANTHROPIC.COM US")
 *  * repair brackets that the export wrote mirrored: "שייק בקטר )שמואל חגג(" → "(שמואל חגג)"
 */
export function cleanMerchant(raw: string): string {
  return raw
    .replace(/[‎‏‪-‮⁦-⁩]/g, "")
    .replace(/\)([^()]*)\(/g, "($1)")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- main ----------

export function parseExport(sheets: SheetRows[], accountType: "bank" | "credit_card"): ParseResult {
  const out: ParsedRow[] = [];
  const warnings: string[] = [];
  const sheetsUsed: string[] = [];
  let skipped = 0;

  for (const sheet of sheets) {
    const header = detectHeader(sheet.rows);
    if (!header) continue;
    sheetsUsed.push(sheet.name);
    const c = header.columns;

    // Bank exports with a single signed "סכום" column: decide which sign means money out.
    let signedOutIsNegative = true;
    if (accountType === "bank" && c.debit === undefined && c.credit === undefined && c.amount !== undefined) {
      const values = sheet.rows
        .slice(header.index + 1)
        .map((r) => parseMoney(r[c.amount!]))
        .filter((v): v is number => v !== null && v !== 0);
      const negatives = values.filter((v) => v < 0).length;
      signedOutIsNegative = negatives >= values.length / 2;
    }

    for (const row of sheet.rows.slice(header.index + 1)) {
      if (!row || row.every((x) => x === null || x === undefined || String(x).trim() === "")) continue;

      const date = parseDate(row[c.date!]);
      const merchant = cleanMerchant(String(row[c.merchant!] ?? ""));
      if (!date || !merchant || SUMMARY_ROW.test(merchant) || SUMMARY_ROW.test(String(row[0] ?? ""))) {
        skipped++;
        continue;
      }

      let amount: number | null = null;
      let isCredit = false;
      if (accountType === "credit_card") {
        amount = parseMoney(row[c.charge ?? c.amount ?? -1]);
        if (amount === null && c.originalAmount !== undefined && parseCurrency(row[c.originalCurrency ?? -1]) === null) {
          amount = parseMoney(row[c.originalAmount]); // ILS purchase, not yet charged
        }
      } else if (c.debit !== undefined || c.credit !== undefined) {
        const debit = parseMoney(row[c.debit ?? -1]) ?? 0;
        const credit = parseMoney(row[c.credit ?? -1]) ?? 0;
        amount = Math.abs(debit) - Math.abs(credit);
        isCredit = credit !== 0 && debit === 0;
      } else {
        const v = parseMoney(row[c.amount!]);
        if (v !== null) {
          amount = signedOutIsNegative ? -v : v;
          isCredit = amount < 0;
        }
      }

      if (amount === null || amount === 0) {
        skipped++;
        continue;
      }

      const inst = parseInstallment(row[c.type ?? -1], row[c.notes ?? -1]);
      const currency = parseCurrency(row[c.originalCurrency ?? -1]);

      out.push({
        date,
        processedDate: parseDate(row[c.processedDate ?? -1]),
        amount: Math.round(amount * 100) / 100,
        merchant,
        originalAmount: currency ? parseMoney(row[c.originalAmount ?? -1]) : null,
        originalCurrency: currency,
        cardCategory: c.category !== undefined ? String(row[c.category] ?? "").trim() || null : null,
        installmentNumber: inst?.number ?? null,
        installmentTotal: inst?.total ?? null,
        isCredit,
      });
    }
  }

  if (!sheetsUsed.length) {
    warnings.push("לא נמצאה שורת כותרות מוכרת (תאריך, תיאור, סכום). ייתכן שזה לא קובץ פירוט עסקאות.");
  }
  return { rows: out, skipped, sheetsUsed, warnings };
}
