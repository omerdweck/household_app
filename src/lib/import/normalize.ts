// Text normalization shared by duplicate detection and category rules.
// Goal: the same merchant written slightly differently maps to the same key.

/** "  שופרסל דיל  רמת-גן 123 " → "שופרסל דיל רמת גן" */
export function normalizeMerchant(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/["'״׳`]/g, "") // quote marks and Hebrew geresh/gershayim
    .replace(/[-_/\\.,*]+/g, " ")
    .replace(/\b\d{3,}\b/g, " ") // branch / terminal numbers
    .replace(/\s+/g, " ")
    .trim();
}

/** Header cells: strip spaces, quotes and currency signs so "סכום חיוב ₪" matches "סכום חיוב". */
export function normalizeHeader(raw: unknown): string {
  return String(raw ?? "")
    .normalize("NFKC")
    .replace(/["'״׳₪$€]|\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
