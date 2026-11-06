import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { classifyKind, fingerprints, mapBankDescription, mapCardCategory } from "./classify";
import { normalizeMerchant } from "./normalize";
import { cleanMerchant, detectHeader, parseDate, parseExport, parseInstallment, parseMoney, type Cell } from "./parse";
import { readWorkbook } from "./read";

// Fixtures copy the EXACT layout of real exports (Max 2026-10 and a Leumi
// statement): same title rows, 16 Max columns, total rows. Values are made up.
const MAX_HEADER = ["תאריך עסקה", "שם בית העסק", "קטגוריה", "4 ספרות אחרונות של כרטיס האשראי", "סוג עסקה", "סכום חיוב", "מטבע חיוב", "סכום עסקה מקורי", "מטבע עסקה מקורי", "תאריך חיוב", "הערות", "תיוגים", "מועדון הנחות", "מפתח דיסקונט", "אופן ביצוע ההעסקה", 'שער המרה ממטבע מקור/התחשבנות לש"ח'];
const maxTitle = (): Cell[][] => [["כל המשתמשים (1)", null, ""], ["כל הכרטיסים (2)", null, ""], ["10/2026", null, ""]];
const maxRow = (date: string, merchant: string, cat: string, card: string, type: string, charge: number, orig = charge, cur = "₪", chargeDate = "02-12-2026", notes = "", how = ""): Cell[] =>
  [date, merchant, cat, card, type, charge, "₪", orig, cur, chargeDate, notes, "", "", "", how, cur === "₪" ? "" : " 3.0420"];

const MAX_LIKE: Cell[][] = [
  ...maxTitle(),
  MAX_HEADER,
  maxRow("03-11-2026", "שופרסל דיל רמת גן", "מזון וצריכה", "1111", "רגילה", 412.6),
  maxRow("03-11-2026", "קפה לנדוור", "מסעדות, קפה וברים", "1111", "רגילה", 18),
  maxRow("03-11-2026", "קפה לנדוור", "מסעדות, קפה וברים", "1111", "רגילה", 18),
  maxRow("01-11-2026", "איקאה", "ריהוט ובית", "1111", "תשלומים", 300, 900, "₪", "02-12-2026", "תשלום 1 מתוך 3"),
  maxRow("28-10-2026", "AMAZON MKTPLACE        AMAZON.COM US", "שונות", "1111", "רגילה", 89.35, 24.5, "$", "02-12-2026", "", "אינטרנט"),
  maxRow("30-10-2026", "זארה", "אופנה", "1111", "זיכוי", -149.9),
  ["סך הכל", null, null],
  ["688.05₪", null, null],
];

// Max splits one export into three sheets; the third is debit-card purchases
// that ALSO appear one by one on the bank statement as "לאומי דביט".
const MAX_SHEETS = [
  { name: "עסקאות במועד החיוב", rows: MAX_LIKE },
  {
    name: 'עסקאות חו"ל ומט"ח',
    rows: [...maxTitle(), MAX_HEADER,
      maxRow("01-09-2026", "SOME SAAS              SAAS.COM US", "חשמל ומחשבים", "2222", "חיוב עסקות מיידי", 31.33, 10, "$", "03-09-2026", "", "אינטרנט"),
      ["סך הכל"], ["31.33₪"]] as Cell[][],
  },
  {
    name: "עסקאות בחיוב מיידי",
    rows: [...maxTitle(), MAX_HEADER,
      maxRow("01-09-2026", "WOLT", "מסעדות, קפה וברים", "2222", "חיוב עסקות מיידי", 67.2, 67.2, "₪", "03-09-2026", "", "טלפוני"),
      maxRow("01-09-2026", "שייק בקטר )שמואל חגג(", "מסעדות, קפה וברים", "2222", "חיוב עסקות מיידי", 18, 18, "₪", "04-09-2026"),
      maxRow("12-09-2026", "המוסד לביטוח לאומי - חשבו", "עירייה וממשלה", "2222", "רגילה", 171, 171, "₪", "02-10-2026", "הוראת קבע"),
      ["סך הכל"], ["256.20₪"]] as Cell[][],
  },
];

const BANK_DEBIT_CREDIT: Cell[][] = [
  ["תנועות בחשבון 12-345-678901"],
  ["תאריך", "תאריך ערך", "תיאור", "אסמכתא", "בחובה", "בזכות", "היתרה בש\"ח"],
  ["01/11/2026", "01/11/2026", "העברה - שכר דירה", "1234", "5,200.00", "", "8,000.00"],
  ["02/11/2026", "02/11/2026", "מקס איט פיננסים", "99", "3,400.00", "", "4,600.00"],
  ["05/11/2026", "05/11/2026", "משכורת", "77", "", "12,000.00", "16,600.00"],
  ["06/11/2026", "06/11/2026", "מקסטוק", "88", "120.00", "", "16,480.00"],
];

const LEUMI_LIKE: Cell[][] = [
  ["תאריך", "סוג תנועה", "זכות", "חובה", "יתרה מצטברת"],
  ["03.11.2026", "מקס איט פיננ-י", "", "₪ 89.12", "₪ 1,000.00"],
  ["03.11.2026", "לאומי דביט", "", "₪ 109.90", "₪ 1,089.12"],
  ["02.11.2026", "דמי כרטיס דביט", "", "₪ 7.00", "₪ 1,199.02"],
  ["01.11.2026", "שיק", "", "₪ 5,200.00", "₪ 1,206.02"],
  ["01.11.2026", "פרעון הלוואה", "", "₪ 807.80", "₪ 6,406.02"],
  ["01.11.2026", "העברת משכורת", "₪ 1,212.23", "", "₪ 7,213.82"],
  ["28.10.2026", "העמדת הלואה", "₪ 40,000.00", "", "₪ 6,001.59"],
  ["28.10.2026", "הפועלים-ביט", "₪ 200.00", "", "₪ -33,998.41"],
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

  it("keeps 6 purchases and skips both total rows", () => {
    expect(res.rows).toHaveLength(6);
    expect(res.skipped).toBe(2); // "סך הכל" and the "688.05₪" line under it
  });

  it("uses the charged ILS amount and keeps the foreign original", () => {
    const amazon = res.rows.find((r) => r.merchant.startsWith("AMAZON"))!;
    expect(amazon.amount).toBe(89.35);
    expect(amazon.originalAmount).toBe(24.5);
    expect(amazon.originalCurrency).toBe("USD");
    expect(amazon.processedDate).toBe("2026-12-02");
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

describe("real Max layout: three sheets", () => {
  const res = parseExport(MAX_SHEETS, "credit_card");

  it("reads every sheet and matches each sheet's own total row", () => {
    expect(res.sheetsUsed).toHaveLength(3);
    for (const sheet of MAX_SHEETS) {
      const rows = parseExport([sheet], "credit_card").rows;
      const total = Number(String(sheet.rows.at(-1)?.[0]).replace("₪", ""));
      expect(Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100).toBe(total);
    }
  });

  it("cleans merchant names for display", () => {
    const names = res.rows.map((r) => r.merchant);
    expect(names).toContain("SOME SAAS SAAS.COM US");
    expect(names).toContain("שייק בקטר (שמואל חגג)");
  });

  it("maps the real Max category names", () => {
    expect(mapCardCategory("עירייה וממשלה")).toBe("חשבונות");
    expect(mapCardCategory("קוסמטיקה וטיפוח")).toBe("טיפוח");
    expect(mapCardCategory("ביטוח")).toBe("ביטוח");
    expect(mapCardCategory("העברת כספים")).toBe("העברות");
    expect(mapCardCategory("דלק, חשמל וגז")).toBe("דלק");
    expect(mapCardCategory("מסעדות, קפה וברים")).toBe("אוכל בחוץ");
    expect(mapCardCategory("מוצרי m_a_x")).toBeNull();
  });
});

describe("real Leumi statement lines", () => {
  const res = parseExport([{ name: "דף חשבון", rows: LEUMI_LIKE }], "bank");
  const kind = (m: string) => classifyKind(res.rows.find((r) => r.merchant === m)!, "bank");

  it("reads '₪ 1,234.56' amounts in debit / credit columns", () => {
    expect(res.rows).toHaveLength(8);
    expect(res.rows.find((r) => r.merchant === "שיק")!.amount).toBe(5200);
  });

  it("does not count Max and debit-card lines again (they are itemized in the Max file)", () => {
    expect(kind("מקס איט פיננ-י")).toBe("card_bill");
    expect(kind("לאומי דביט")).toBe("card_bill");
  });

  it("keeps the debit-card FEE as a real expense", () => {
    expect(kind("דמי כרטיס דביט")).toBe("expense");
  });

  it("does not treat a loan being paid out as income", () => {
    expect(kind("העמדת הלואה")).toBe("internal_transfer");
    expect(kind("העברת משכורת")).toBe("income");
    expect(kind("פרעון הלוואה")).toBe("expense");
  });

  it("suggests categories from bank descriptions", () => {
    expect(mapBankDescription("פרעון הלוואה")).toBe("הלוואות");
    expect(mapBankDescription("דמי כרטיס דביט")).toBe("עמלות ובנק");
    expect(mapBankDescription("שיק")).toBeNull();
  });
});

describe("cleanMerchant", () => {
  it("strips invisible direction marks from PDF / HTML text", () => {
    expect(cleanMerchant("‫מקס איט פיננ‪-‬י‬")).toBe("מקס איט פיננ-י");
  });
});
