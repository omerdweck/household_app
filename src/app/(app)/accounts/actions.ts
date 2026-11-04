"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getHousehold } from "@/lib/household";
import { PROVIDERS, type AccountType, type Provider } from "@/lib/types";

export type FormState = { error?: string; ok?: boolean };

export async function addAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const { me } = await getHousehold();

  const provider = String(formData.get("provider") ?? "") as Provider;
  if (!(provider in PROVIDERS)) return { error: "בחרו בנק או חברת אשראי" };

  const type = (PROVIDERS[provider].type ?? String(formData.get("type") ?? "")) as AccountType;
  if (type !== "bank" && type !== "credit_card") return { error: "בחרו סוג חשבון" };

  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "תנו לחשבון שם, למשל \"מקס של עומר\"" };

  const last4 = String(formData.get("last4") ?? "").trim();
  if (last4 && !/^\d{4}$/.test(last4)) return { error: "4 ספרות אחרונות — בדיוק 4 ספרות" };

  const supabase = await createClient();
  const { error } = await supabase.from("accounts").insert({
    member_id: me.id, // you can only add accounts for yourself
    provider,
    type,
    label,
    last4: last4 || null,
  });
  if (error) return { error: "השמירה נכשלה. נסו שוב." };

  revalidatePath("/accounts");
  return { ok: true };
}

export async function setAccountActive(accountId: string, isActive: boolean) {
  const { me } = await getHousehold();
  const supabase = await createClient();
  // Scoped to the current member: a partner's account is read-only in the UI.
  await supabase
    .from("accounts")
    .update({ is_active: isActive })
    .eq("id", accountId)
    .eq("member_id", me.id);
  revalidatePath("/accounts");
}
