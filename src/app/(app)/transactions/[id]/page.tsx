import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getHousehold } from "@/lib/household";
import { categoryOptions } from "@/lib/categories";
import type { Split } from "@/lib/money";
import type { Account, Category, Transaction } from "@/lib/types";
import { deleteTransaction, updateTransaction } from "../actions";
import { TransactionForm } from "../TransactionForm";
import { SplitEditor } from "./SplitEditor";
import { DeleteButton } from "./DeleteButton";

const SOURCE_LABEL = {
  manual: "נוסף ידנית",
  file_import: "יובא מקובץ",
  bank_sync: "סונכרן מהבנק",
  shortcut: "נקלט מ-Apple Pay",
} as const;

export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { me, partner } = await getHousehold();
  const supabase = await createClient();

  const [{ data: tx }, { data: accounts }, { data: categories }] = await Promise.all([
    supabase
      .from("transactions")
      .select("*, transaction_splits(member_id, amount)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("accounts").select("id, member_id, provider, type, label, last4, is_active"),
    supabase.from("categories").select("id, name, parent_id, default_tag, sort_order"),
  ]);
  if (!tx) notFound();

  const t = tx as Transaction & { transaction_splits: Split[] };
  const imported = t.source !== "manual";
  const account = (accounts as Account[] | null)?.find((a) => a.id === t.account_id);

  return (
    <main className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.merchant}</h1>
          <p className="text-xs text-muted">
            {SOURCE_LABEL[t.source]}
            {account && ` · ${account.label}`}
          </p>
        </div>
        <Link href={`/transactions?month=${t.date.slice(0, 7)}`} className="text-sm text-muted">
          חזרה
        </Link>
      </header>

      {partner && t.kind === "expense" && (
        <SplitEditor
          transactionId={t.id}
          amount={t.amount}
          paidBy={t.paid_by}
          splits={t.transaction_splits}
          me={me}
          partner={partner}
        />
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">פרטים</h2>
        <TransactionForm
          mode="edit"
          action={updateTransaction.bind(null, t.id)}
          defaults={t}
          me={me}
          partner={partner}
          accounts={(accounts ?? []) as Account[]}
          categories={categoryOptions((categories ?? []) as Category[])}
          imported={imported}
        />
      </section>

      {!imported && <DeleteButton action={deleteTransaction.bind(null, t.id)} />}
    </main>
  );
}
