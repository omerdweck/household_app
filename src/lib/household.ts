import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Member } from "@/lib/types";

export type Household = {
  me: Member;
  partner: Member | null;
  members: Member[];
};

/**
 * The signed-in member and their partner. Redirects to /login or /not-allowed.
 * Wrapped in React cache() so a layout and a page in the same request share one query.
 */
export const getHousehold = cache(async (): Promise<Household> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: members } = await supabase
    .from("members")
    .select("id, user_id, display_name")
    .order("display_name");

  const me = members?.find((m) => m.user_id === user.id);
  if (!me || !members) redirect("/not-allowed");

  // The partner row exists from day one (added by e-mail), even before their first login.
  const partner = members.find((m) => m.id !== me.id) ?? null;
  return { me, partner, members };
});

export function memberName(h: Household, memberId: string): string {
  if (memberId === h.me.id) return "אני";
  return h.members.find((m) => m.id === memberId)?.display_name ?? "—";
}
