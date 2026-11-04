import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getHousehold } from "@/lib/household";
import { categoryOptions } from "@/lib/categories";
import { todayIL } from "@/lib/dates";
import type { Account, Category } from "@/lib/types";
import { createTransaction } from "../actions";
import { TransactionForm } from "../TransactionForm";

export default async function NewTransactionPage() {
  const { me, partner } = await getHousehold();
  const supabase = await createClient();
  const [{ data: accounts }, { data: categories }] = await Promise.all([
    supabase.from("accounts").select("id, member_id, provider, type, label, last4, is_active"),
    supabase.from("categories").select("id, name, parent_id, default_tag, sort_order"),
  ]);

  return (
    <main className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">הוצאה חדשה</h1>
        <Link href="/transactions" className="text-sm text-muted">
          ביטול
        </Link>
      </header>
      <TransactionForm
        mode="new"
        action={createTransaction}
        defaults={{ date: todayIL(), paid_by: me.id }}
        me={me}
        partner={partner}
        accounts={(accounts ?? []) as Account[]}
        categories={categoryOptions((categories ?? []) as Category[])}
      />
    </main>
  );
}
