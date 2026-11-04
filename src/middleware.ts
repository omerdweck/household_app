import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skip static files, icons and the PWA manifest.
  matcher: [
    "/((?!_next/static|_next/image|icons/|manifest.webmanifest|favicon.ico|.*\\.(?:png|jpg|svg|webp)$).*)",
  ],
};
