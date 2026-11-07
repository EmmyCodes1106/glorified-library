import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "glorified_session";

const PUBLIC_PATHS = new Set([
  "/login",
  "/setup",
  "/forgot-password",
  "/reset-password",
  "/forbidden",
]);

// Cookie presence only. Session validity and permissions are enforced in the
// data access layer and in every server action / route handler.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.has(pathname);

  if (!signedIn && !isPublic) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  if (signedIn && (pathname === "/login" || pathname === "/forgot-password")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
