import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Modules are placeholders for now; each one is built in its own stage.
const MODULES = [
  { title: "הוצאות", stage: "שלב 1" },
  { title: "תקציב חודשי", stage: "שלב 2" },
  { title: "חשבונות דירה", stage: "שלב 2" },
  { title: "לו״ז זוגי", stage: "שלב 4" },
  { title: "רשימת קניות", stage: "שלב 5" },
];

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS lets a signed-in household member read the members table.
  // Anyone else gets an empty result.
  const { data: members } = await supabase
    .from("members")
    .select("user_id, display_name")
    .order("display_name");

  const me = members?.find((m) => m.user_id === user.id);
  if (!me) redirect("/not-allowed");

  const partner = members?.find((m) => m.user_id !== user.id);

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">שלום, {me.display_name}</h1>
          <p className="text-sm text-muted">
            {partner?.display_name
              ? `משק הבית שלך ושל ${partner.display_name}`
              : "בת/בן הזוג עוד לא התחברו"}
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="rounded-lg border border-border px-3 py-1.5 text-sm">
            יציאה
          </button>
        </form>
      </header>

      <ul className="grid grid-cols-2 gap-3">
        {MODULES.map((m) => (
          <li
            key={m.title}
            className="rounded-2xl border border-border bg-surface p-4"
          >
            <p className="font-semibold">{m.title}</p>
            <p className="mt-1 text-xs text-muted">בקרוב · {m.stage}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
