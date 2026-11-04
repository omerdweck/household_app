// Row shapes as PostgREST returns them (numeric columns arrive as numbers).

export type Tag = "apartment" | "personal";
export type TxKind = "expense" | "card_bill" | "internal_transfer" | "settlement" | "income";
export type TxStatus = "provisional" | "pending" | "completed";
export type TxSource = "bank_sync" | "file_import" | "shortcut" | "manual";
export type Provider = "leumi" | "discount" | "max" | "other";
export type AccountType = "bank" | "credit_card";

export type Member = {
  id: string;
  user_id: string | null;
  display_name: string;
};

export type Account = {
  id: string;
  member_id: string;
  provider: Provider;
  type: AccountType;
  label: string;
  last4: string | null;
  is_active: boolean;
};

export type Category = {
  id: string;
  name: string;
  parent_id: string | null;
  default_tag: Tag | null;
  sort_order: number;
};

export type Transaction = {
  id: string;
  account_id: string | null;
  paid_by: string;
  date: string;
  amount: number;
  merchant: string;
  description: string | null;
  category_id: string | null;
  tag: Tag | null;
  kind: TxKind;
  status: TxStatus;
  source: TxSource;
  notes: string | null;
};

export type TransactionSplit = { member_id: string; amount: number };

export const PROVIDERS: Record<Provider, { label: string; type: AccountType | null }> = {
  leumi: { label: "בנק לאומי", type: "bank" },
  discount: { label: "בנק דיסקונט", type: "bank" },
  max: { label: "מקס", type: "credit_card" },
  other: { label: "אחר", type: null },
};

export const TAG_LABEL: Record<Tag, string> = {
  apartment: "דירה",
  personal: "אישי",
};

export const KIND_LABEL: Record<TxKind, string> = {
  expense: "הוצאה",
  card_bill: "חיוב כרטיס אשראי (לא נספר)",
  internal_transfer: "העברה בין החשבונות שלנו",
  settlement: "החזר בין בני הזוג",
  income: "הכנסה",
};
