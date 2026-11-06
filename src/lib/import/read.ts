// Read any spreadsheet the banks export (.xlsx, old .xls, CSV, or an HTML table
// saved with an .xls name) into plain rows. Runs in the browser: the file itself
// never leaves the phone — only the parsed rows are sent to the server.
import * as XLSX from "xlsx";
import type { Cell, SheetRows } from "./parse";

export function readWorkbook(data: ArrayBuffer | Uint8Array): SheetRows[] {
  // raw: true keeps text cells (HTML / CSV exports) as text. Otherwise SheetJS guesses
  // "01/11/2026" as US month-first — 11 Jan instead of 1 Nov. parseDate() reads them
  // day-first. Real date cells in .xlsx still arrive as Date objects (cellDates).
  const wb = XLSX.read(data, { type: "array", cellDates: true, dense: true, raw: true });
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    }),
  }));
}
