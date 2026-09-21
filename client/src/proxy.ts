import { NextResponse, type NextRequest } from "next/server";

// Route guard. Cookie PRESENCE only (Edge runtime has no JWT secret) — the
// API verifies signatures per request, and AuthProvider re-boots on load.
// Both cookies count as "signed in": chalk_rt (30d) covers idle gaps where
// chalk_at (15min) already expired — the first API 401 silently refreshes.

const PROTECTED_PREFIXES = ["/generate", "/watch/"];
const GUEST_ONLY = new Set(["/login", "/signup"]);

export function proxy(req: NextRequest) {
  const signedIn =
    req.cookies.has("chalk_at") || req.cookies.has("chalk_rt");
  const { pathname } = req.nextUrl;

  if (!signedIn && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (signedIn && GUEST_ONLY.has(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/generate";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/generate", "/watch/:path*", "/login", "/signup"],
};
