import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getHousehold } from "@/lib/household";
import { PROVIDERS, type Account } from "@/lib/types";
import { AddAccountForm } from "./AddAccountForm";
import { setAccountActive } from "./actions";

export default async function AccountsPage() {
  const { me, partner } = await getHousehold();
  const supabase = await createClient();
  const { data } = await supabase
    .from("accounts")
    .select("id, member_id, provider, type, label, last4, is_active")
    .order("is_active", { ascending: false })
    .order("label");
  const accounts = (data ?? []) as Account[];

  const mine = accounts.filter((a) => a.member_id === me.id);
  const theirs = partner ? accounts.filter((a) => a.member_id === partner.id) : [];

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">החשבונות שלי</h1>
        <p className="text-sm text-muted">
          הבנקים וכרטיסי האשראי שמהם נכנסות ההוצאות. כל אחד מוסיף את החשבונות שלו.
        </p>
      </header>

      <section className="space-y-3">
        <AccountList accounts={mine} editable />
        <AddAccountForm defaultLabelOwner={me.display_name} />
      </section>

      {partner && (
        <section className="space-y-3">
          <h2 className="font-semibold">החשבונות של {partner.display_name}</h2>
          {theirs.length ? (
            <AccountList accounts={theirs} />
          ) : (
            <p className="text-sm text-muted">עוד לא נוספו חשבונות.</p>
          )}
        </section>
      )}
    </main>
  );
}

function AccountList({ accounts, editable = false }: { accounts: Account[]; editable?: boolean }) {
  if (!accounts.length && editable) {
    return <p className="text-sm text-muted">עוד אין חשבונות. הוסיפו את הראשון כדי להתחיל לייבא הוצאות.</p>;
  }
  return (
    <ul className="space-y-2">
      {accounts.map((a) => (
        <li
          key={a.id}
          className={`flex items-center justify-between rounded-2xl border border-border p-4 ${
            a.is_active ? "bg-surface" : "opacity-50"
          }`}
        >
          <div>
            <p className="font-semibold">{a.label}</p>
            <p className="text-xs text-muted">
              {PROVIDERS[a.provider].label} · {a.type === "bank" ? "חשבון בנק" : "כרטיס אשראי"}
              {a.last4 && (
                <>
                  {" · "}
                  <bdi dir="ltr">••••{a.last4}</bdi>
                </>
              )}
              {!a.is_active && " · מושבת"}
            </p>
          </div>
          {editable && (
            <div className="flex shrink-0 items-center gap-3">
              {a.is_active && (
                <Link href={`/import?account=${a.id}`} className="text-sm font-semibold text-accent">
                  ייבוא קובץ
                </Link>
              )}
              <form action={setAccountActive.bind(null, a.id, !a.is_active)}>
                <button className="text-sm text-muted underline">{a.is_active ? "השבתה" : "הפעלה"}</button>
              </form>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
