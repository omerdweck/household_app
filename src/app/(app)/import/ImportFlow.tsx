"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { classifyKind } from "@/lib/import/classify";
import { parseExport, type ParseResult } from "@/lib/import/parse";
import { readWorkbook } from "@/lib/import/read";
import { formatILS } from "@/lib/money";
import type { Account } from "@/lib/types";
import { importFile, type ImportResult } from "./actions";

type Preview = ParseResult & { fileName: string; cardBills: number; income: number; spent: number };

/** 2026-10-28 → 28/10/2026 */
const dmy = (iso: string) => iso.split("-").reverse().join("/");

export function ImportFlow({ accounts, initialAccountId }: { accounts: Account[]; initialAccountId?: string }) {
  const [accountId, setAccountId] = useState(initialAccountId ?? accounts[0]?.id ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  const account = accounts.find((a) => a.id === accountId);

  async function onFile(file: File | undefined) {
    setPreview(null);
    setResult(null);
    setReadError(null);
    if (!file || !account) return;
    try {
      const sheets = readWorkbook(new Uint8Array(await file.arrayBuffer()));
      const parsed = parseExport(sheets, account.type);
      const kinds = parsed.rows.map((r) => classifyKind(r, account.type));
      setPreview({
        ...parsed,
        fileName: file.name,
        cardBills: kinds.filter((k) => k === "card_bill").length,
        income: kinds.filter((k) => k === "income").length,
        spent: parsed.rows.reduce((s, r, i) => (kinds[i] === "expense" ? s + r.amount : s), 0),
      });
    } catch {
      setReadError("לא הצלחתי לקרוא את הקובץ. ודאו שזה קובץ Excel או CSV שהורד מהבנק / מחברת האשראי.");
    }
  }

  function confirm() {
    if (!preview || !account) return;
    startTransition(async () => setResult(await importFile(account.id, preview.fileName, preview.rows)));
  }

  if (!accounts.length) {
    return (
      <p className="rounded-2xl border border-border bg-surface p-4 text-sm">
        קודם צריך להוסיף חשבון.{" "}
        <Link href="/accounts" className="text-accent underline">
          להוספת חשבון
        </Link>
      </p>
    );
  }

  if (result?.ok) {
    return (
      <div className="space-y-3 rounded-2xl border border-accent bg-surface p-4">
        <p className="text-lg font-bold">הייבוא הסתיים</p>
        <ul className="space-y-1 text-sm">
          <li>נוספו {result.inserted} עסקאות</li>
          {result.duplicates > 0 && <li className="text-muted">{result.duplicates} כבר היו קיימות ודולגו</li>}
          {result.cardBills > 0 && (
            <li className="text-muted">{result.cardBills} חיובי כרטיס אשראי סומנו כ&quot;לא נספר&quot; (כדי שלא ייספרו פעמיים)</li>
          )}
        </ul>
        <div className="flex gap-2">
          <Link
            href={`/transactions?month=${result.month}`}
            className="flex-1 rounded-xl bg-accent py-2.5 text-center font-semibold text-accent-foreground"
          >
            לרשימת ההוצאות
          </Link>
          <button
            onClick={() => {
              setResult(null);
              setPreview(null);
            }}
            className="rounded-xl border border-border px-4"
          >
            קובץ נוסף
          </button>
        </div>
      </div>
    );
  }

  const dates = preview?.rows.map((r) => r.date).sort();

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block text-muted">לאיזה חשבון הקובץ שייך</span>
        <select
          value={accountId}
          onChange={(e) => {
            setAccountId(e.target.value);
            setPreview(null);
          }}
          className="input"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-accent p-6 text-center">
        <span className="font-semibold text-accent">בחירת קובץ</span>
        <span className="mt-1 block text-xs text-muted">Excel (xlsx / xls) או CSV, כפי שהורד מהאתר</span>
        <input
          key={accountId}
          type="file"
          accept=".xlsx,.xls,.csv,.html,.htm"
          className="sr-only"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </label>
      <p className="text-xs text-muted">הקובץ נקרא בטלפון עצמו; רק העסקאות נשלחות לשמירה.</p>

      {readError && <p className="text-sm text-danger">{readError}</p>}

      {preview && (
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <p className="font-semibold">{preview.fileName}</p>

          {preview.warnings.map((w) => (
            <p key={w} className="text-sm text-danger">
              {w}
            </p>
          ))}

          {preview.rows.length > 0 && dates && (
            <>
              <ul className="space-y-1 text-sm">
                <li>
                  {preview.rows.length} עסקאות · <bdi dir="ltr">{dmy(dates[0])}</bdi> עד{" "}
                  <bdi dir="ltr">{dmy(dates[dates.length - 1])}</bdi>
                </li>
                <li>
                  סה״כ הוצאות: <span dir="ltr">{formatILS(preview.spent)}</span>
                </li>
                {preview.cardBills > 0 && <li className="text-muted">{preview.cardBills} חיובי כרטיס (לא ייספרו)</li>}
                {preview.income > 0 && <li className="text-muted">{preview.income} זיכויים / הכנסות</li>}
                {preview.skipped > 0 && <li className="text-muted">{preview.skipped} שורות סיכום או ריקות דולגו</li>}
              </ul>

              <ul className="divide-y divide-border rounded-xl border border-border bg-background text-sm">
                {preview.rows.slice(0, 5).map((r, i) => (
                  <li key={i} className="flex justify-between gap-2 p-2">
                    <span className="truncate">
                      <span className="text-muted" dir="ltr">
                        {r.date.slice(5).split("-").reverse().join("/")}
                      </span>{" "}
                      {r.merchant}
                    </span>
                    <span dir="ltr" className="shrink-0">
                      {formatILS(r.amount)}
                    </span>
                  </li>
                ))}
              </ul>
              {preview.rows.length > 5 && (
                <p className="text-xs text-muted">ועוד {preview.rows.length - 5}…</p>
              )}

              <button
                onClick={confirm}
                disabled={pending}
                className="w-full rounded-xl bg-accent py-3 font-semibold text-accent-foreground disabled:opacity-60"
              >
                {pending ? "מייבא…" : `ייבוא ל"${account?.label}"`}
              </button>
            </>
          )}
          {result && !result.ok && <p className="text-sm text-danger">{result.error}</p>}
        </section>
      )}
    </div>
  );
}
