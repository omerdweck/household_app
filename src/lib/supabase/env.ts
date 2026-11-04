// Public Supabase settings. Both values are safe to expose in the browser:
// what protects the data is Row Level Security in the database, not this key.
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — copy .env.example to .env.local",
    );
  }
  return { url, key };
}
