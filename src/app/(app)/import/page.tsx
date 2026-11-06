import { createClient } from "@/lib/supabase/server";
import { getHousehold } from "@/lib/household";
import type { Account } from "@/lib/types";
import { ImportFlow } from "./ImportFlow";
import { undoImport } from "./actions";
import { UndoButton } from "./UndoButton";

type Batch = {
  id: string;
  file_name: string;
  inserted: number;
  duplicates: number;
  date_from: string | null;
  date_to: string | null;
  created_at: string;
  accounts: { label: string; member_id: string } | null;
};

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const { account } = await searchParams;
  const { me } = await getHousehold();
  const supabase = await createClient();

  const [{ data: accounts }, { data: batches }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, member_id, provider, type, label, last4, is_active")
      .eq("member_id", me.id)
      .eq("is_active", true)
      .order("label"),
    supabase
      .from("import_batches")
      .select("id, file_name, inserted, duplicates, date_from, date_to, created_at, accounts(label, member_id)")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const recent = (batches ?? []) as unknown as Batch[];
  const fmt = (d: string | null) => (d ? d.slice(5).split("-").reverse().join("/") : "");

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">ייבוא קובץ</h1>
        <p className="text-sm text-muted">
          מורידים &quot;פירוט עסקאות&quot; מהאתר של הבנק או של חברת האשראי ומעלים כאן. ייבוא חוזר של אותו קובץ לא יוצר כפילויות.
        </p>
      </header>

      <ImportFlow accounts={(accounts ?? []) as Account[]} initialAccountId={account} />

      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">ייבואים אחרונים</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {recent.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{b.accounts?.label ?? "—"}</p>
                  <p className="truncate text-xs text-muted">
                    {b.inserted} נוספו
                    {b.duplicates > 0 && ` · ${b.duplicates} כפולות`}
                    {b.date_from && (
                      <>
                        {" · "}
                        <bdi dir="ltr">
                          {fmt(b.date_from)}–{fmt(b.date_to)}
                        </bdi>
                      </>
                    )}
                  </p>
                </div>
                {b.accounts?.member_id === me.id && b.inserted > 0 && (
                  <UndoButton action={undoImport.bind(null, b.id)} count={b.inserted} />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
