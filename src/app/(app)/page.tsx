import Link from "next/link";
import { getHousehold } from "@/lib/household";

const MODULES = [
  { title: "הוצאות", href: "/transactions", note: "רשימה, הוספה וחלוקה" },
  { title: "ייבוא קובץ", href: "/import", note: "פירוט עסקאות מהבנק / מקס" },
  { title: "החשבונות שלי", href: "/accounts", note: "בנקים וכרטיסי אשראי" },
  { title: "תקציב חודשי", note: "בקרוב · שלב 2" },
  { title: "חשבונות דירה", note: "בקרוב · שלב 2" },
  { title: "לו״ז זוגי", note: "בקרוב · שלב 4" },
  { title: "רשימת קניות", note: "בקרוב · שלב 5" },
];

export default async function HomePage() {
  const { me, partner } = await getHousehold();

  return (
    <main>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">שלום, {me.display_name}</h1>
          <p className="text-sm text-muted">
            {partner ? `משק הבית שלך ושל ${partner.display_name}` : "משק הבית שלך"}
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="rounded-lg border border-border px-3 py-1.5 text-sm">יציאה</button>
        </form>
      </header>

      <ul className="grid grid-cols-2 gap-3">
        {MODULES.map((m) => {
          const body = (
            <>
              <p className="font-semibold">{m.title}</p>
              <p className="mt-1 text-xs text-muted">{m.note}</p>
            </>
          );
          return (
            <li key={m.title}>
              {m.href ? (
                <Link
                  href={m.href}
                  className="block rounded-2xl border border-border bg-surface p-4 active:opacity-70"
                >
                  {body}
                </Link>
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-4 opacity-60">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
