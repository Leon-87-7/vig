import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/logout", "/privacy", "/terms", "/restricted"];

function withPreviewNoindex(response: NextResponse, pathname: string, preview?: string) {
  if (preview && pathname !== "/") response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get("vig_session");
  const preview = request.cookies.get("ownix_preview");

  if (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_API_MOCK === "1"
  ) {
    return withPreviewNoindex(NextResponse.next(), pathname, preview?.value);
  }

  // Public landing stays reachable for everyone; the CTA is session-aware.
  if (pathname === "/") {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return withPreviewNoindex(NextResponse.next(), pathname, preview?.value);
  }

  if (!session?.value && !preview?.value) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return withPreviewNoindex(NextResponse.next(), pathname, preview?.value);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.).*)"],
};
