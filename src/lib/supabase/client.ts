import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

// Supabase client for code that runs in the browser (client components).
export function createClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key);
}
