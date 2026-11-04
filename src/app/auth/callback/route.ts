import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google sends the user back here with a one-time ?code=...
// We exchange it for a Supabase session (stored in cookies) and go to the home page.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Supabase reports a failed sign-up as ?error=... — this is what happens when
  // the database trigger rejects an e-mail that is not on the household list.
  if (searchParams.get("error") || !code) {
    return NextResponse.redirect(`${origin}/not-allowed`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/not-allowed`);
  }

  return NextResponse.redirect(`${origin}/`);
}
