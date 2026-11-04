"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // On success the browser is redirected to Google, so we only get here on failure.
    if (error) {
      setError("ההתחברות נכשלה. נסו שוב.");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-8 px-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold">משק הבית</h1>
        <p className="mt-2 text-muted">הוצאות, תקציב, לו״ז וקניות — במקום אחד</p>
      </div>

      <button
        onClick={signInWithGoogle}
        disabled={loading}
        className="w-full rounded-xl bg-accent px-4 py-3 font-semibold text-accent-foreground disabled:opacity-60"
      >
        {loading ? "מעביר ל-Google…" : "התחברות עם Google"}
      </button>

      {error && <p className="text-sm text-danger">{error}</p>}

      <p className="text-center text-xs text-muted">
        הגישה מוגבלת לבני משק הבית בלבד.
      </p>
    </main>
  );
}
