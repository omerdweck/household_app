import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { classifyKind, fingerprints, mapCardCategory } from "./classify";
import { normalizeMerchant } from "./normalize";
import { detectHeader, parseDate, parseExport, parseInstallment, parseMoney, type Cell } from "./parse";
import { readWorkbook } from "./read";

// Simulated exports, built from the public layouts of Max and Israeli bank
// statements. Real sample files will be added as fixtures when available.
const MAX_LIKE: Cell[][] = [
  ["פירוט עסקאות לכרטיס מסטרקארד 4821"],
  ["כל המשתמשים (1)"],
  [],
  ["תאריך עסקה", "שם בית העסק", "קטגוריה", "4 ספרות אחרונות של כרטיס האשראי", "סוג עסקה", "סכום חיוב", "מטבע חיוב", "סכום עסקה מקורי", "מטבע עסקה מקורי", "תאריך חיוב", "הערות"],
  ["03-11-2026", "שופרסל דיל רמת גן", "מזון וצריכה", "4821", "רגילה", 412.6, "₪", 412.6, "₪", "10-12-2026", ""],
  ["03-11-2026", "קפה לנדוור", "מסעדות, קפה וברים", "4821", "רגילה", 18, "₪", 18, "₪", "10-12-2026", ""],
  ["03-11-2026", "קפה לנדוור", "מסעדות, קפה וברים", "4821", "רגילה", 18, "₪", 18, "₪", "10-12-2026", ""],
  ["01-11-2026", "איקאה", "ריהוט ובית", "4821", "תשלומים", 300, "₪", 900, "₪", "10-12-2026", "תשלום 1 מתוך 3"],
  ["28-10-2026", "AMAZON MKTPLACE", "שונות", "4821", "רגילה", 89.35, "₪", 24.5, "$", "10-12-2026", ""],
  ["30-10-2026", "זארה", "אופנה", "4821", "זיכוי", -149.9, "₪", -149.9, "₪", "10-12-2026", ""],
  ["", "סה\"כ", "", "", "", 688.05, "", "", "", "", ""],
];

const BANK_DEBIT_CREDIT: Cell[][] = [
  ["תנועות בחשבון 12-345-678901"],
  ["תאריך", "תאריך ערך", "תיאור", "אסמכתא", "בחובה", "בזכות", "היתרה בש\"ח"],
  ["01/11/2026", "01/11/2026", "העברה - שכר דירה", "1234", "5,200.00", "", "8,000.00"],
  ["02/11/2026", "02/11/2026", "מקס איט פיננסים", "99", "3,400.00", "", "4,600.00"],
  ["05/11/2026", "05/11/2026", "משכורת", "77", "", "12,000.00", "16,600.00"],
  ["06/11/2026", "06/11/2026", "מקסטוק", "88", "120.00", "", "16,480.00"],
];

const BANK_SIGNED: Cell[][] = [
  ["תאריך", "תיאור התנועה", "סכום"],
  ["01.11.26", "חברת החשמל", -318.4],
  ["03.11.26", "ביט מנועה", 2600],
  ["04.11.26", "ארנונה עיריית רמת גן", -620],
];

describe("cell parsing", () => {
  it.each([
    ["03-11-2026", "2026-11-03"],
    ["3/11/26", "2026-11-03"],
    ["03.11.2026", "2026-11-03"],
    ["2026-11-03", "2026-11-03"],
    [46329, "2026-11-03"], // Excel serial
  ])("date %j", (input, out) => expect(parseDate(input)).toBe(out));

  it("rejects impossible dates", () => {
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("hello")).toBeNull();
  });

  it.each([
    ["1,234.50", 1234.5],
    ["₪ -45", -45],
    ["(30.00)", -30],
    ["45.00-", -45],
    [12.5, 12.5],
  ])("money %j", (input, out) => expect(parseMoney(input)).toBe(out));

  it("finds installments in Hebrew text", () => {
    expect(parseInstallment("תשלומים", "תשלום 2 מתוך 3")).toEqual({ number: 2, total: 3 });
    expect(parseInstallment("רגילה", "")).toBeNull();
  });
});

describe("Max-like credit card export", () => {
  const res = parseExport([{ name: "עסקאות במועד החיוב", rows: MAX_LIKE }], "credit_card");

  it("finds the header below the title rows", () => {
    expect(detectHeader(MAX_LIKE)?.index).toBe(3);
  });

  it("keeps 6 purchases and skips the total row", () => {
    expect(res.rows).toHaveLength(6);
    expect(res.skipped).toBe(1);
  });

  it("uses the charged ILS amount and keeps the foreign original", () => {
    const amazon = res.rows.find((r) => r.merchant.startsWith("AMAZON"))!;
    expect(amazon.amount).toBe(89.35);
    expect(amazon.originalAmount).toBe(24.5);
    expect(amazon.originalCurrency).toBe("USD");
    expect(amazon.processedDate).toBe("2026-12-10");
  });

  it("charges installments by the monthly payment", () => {
    const ikea = res.rows.find((r) => r.merchant === "איקאה")!;
    expect(ikea.amount).toBe(300);
    expect(ikea.installmentNumber).toBe(1);
    expect(ikea.installmentTotal).toBe(3);
  });

  it("keeps refunds as negative expenses", () => {
    const zara = res.rows.find((r) => r.merchant === "זארה")!;
    expect(zara.amount).toBe(-149.9);
    expect(classifyKind(zara, "credit_card")).toBe("expense");
  });

  it("maps the card's categories to ours", () => {
    expect(mapCardCategory("מזון וצריכה")).toBe("סופר");
    expect(mapCardCategory("מסעדות, קפה וברים")).toBe("אוכל בחוץ");
    expect(mapCardCategory("משהו חדש")).toBeNull();
  });
});

describe("bank statement with debit / credit columns", () => {
  const res = parseExport([{ name: "תנועות", rows: BANK_DEBIT_CREDIT }], "bank");
  const by = (m: string) => res.rows.find((r) => r.merchant === m)!;

  it("reads debit as money out and credit as money in", () => {
    expect(by("העברה - שכר דירה").amount).toBe(5200);
    expect(by("משכורת").amount).toBe(-12000);
    expect(by("משכורת").isCredit).toBe(true);
  });

  it("marks the monthly card charge so it is not counted twice", () => {
    expect(classifyKind(by("מקס איט פיננסים"), "bank")).toBe("card_bill");
  });

  it("does not confuse the store Maxstock with the Max card bill", () => {
    expect(classifyKind(by("מקסטוק"), "bank")).toBe("expense");
  });

  it("classifies salary as income", () => {
    expect(classifyKind(by("משכורת"), "bank")).toBe("income");
  });
});

describe("bank statement with one signed amount column", () => {
  const res = parseExport([{ name: "s", rows: BANK_SIGNED }], "bank");

  it("works out that negative means money out", () => {
    expect(res.rows.find((r) => r.merchant === "חברת החשמל")!.amount).toBe(318.4);
    const bit = res.rows.find((r) => r.merchant === "ביט מנועה")!;
    expect(bit.amount).toBe(-2600);
    expect(bit.isCredit).toBe(true);
  });
});

describe("duplicate fingerprints", () => {
  const rows = parseExport([{ name: "x", rows: MAX_LIKE }], "credit_card").rows;

  it("gives two identical coffees different fingerprints", async () => {
    const fp = await fingerprints(rows, "acc");
    const coffees = rows.map((r, i) => [r.merchant, fp[i]]).filter(([m]) => m === "קפה לנדוור");
    expect(coffees[0][1]).not.toBe(coffees[1][1]);
  });

  it("is identical when the same file is imported again", async () => {
    expect(await fingerprints(rows, "acc")).toEqual(await fingerprints(rows, "acc"));
  });

  it("differs per account", async () => {
    expect((await fingerprints(rows, "a"))[0]).not.toBe((await fingerprints(rows, "b"))[0]);
  });

  it("ignores small spelling differences in the merchant", () => {
    expect(normalizeMerchant('שופרסל דיל  רמת-גן 1234')).toBe(normalizeMerchant("שופרסל דיל רמת גן"));
  });
});

describe("reading real file formats", () => {
  it("reads an .xlsx workbook and parses it end to end", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(MAX_LIKE), "עסקאות");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["סיכום"], ["אין כאן טבלה"]]), "סיכום");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const res = parseExport(readWorkbook(buf), "credit_card");
    expect(res.sheetsUsed).toEqual(["עסקאות"]);
    expect(res.rows).toHaveLength(6);
  });

  it("reads an HTML table saved as .xls (common in bank exports)", () => {
    const html = `<html><body><table>
      <tr><td>תאריך</td><td>תיאור</td><td>בחובה</td><td>בזכות</td></tr>
      <tr><td>01/11/2026</td><td>שכר דירה</td><td>5,200.00</td><td></td></tr>
    </table></body></html>`;
    const res = parseExport(readWorkbook(new TextEncoder().encode(html)), "bank");
    expect(res.rows).toEqual([expect.objectContaining({ date: "2026-11-01", amount: 5200, merchant: "שכר דירה" })]);
  });

  it("keeps the calendar day of real Excel date cells", () => {
    const sheet = XLSX.utils.aoa_to_sheet(
      [
        ["תאריך עסקה", "שם בית העסק", "סכום חיוב"],
        [new Date(2026, 10, 1), "שכר דירה", 5200],
        [new Date(2026, 10, 30), "סוף החודש", 10],
      ],
      { cellDates: true },
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "s");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const dates = parseExport(readWorkbook(buf), "credit_card").rows.map((r) => r.date);
    expect(dates).toEqual(["2026-11-01", "2026-11-30"]);
  });

  it("explains when no transactions table is found", () => {
    const res = parseExport([{ name: "x", rows: [["שלום"], ["עולם"]] }], "bank");
    expect(res.rows).toHaveLength(0);
    expect(res.warnings[0]).toContain("לא נמצאה שורת כותרות");
  });
});
