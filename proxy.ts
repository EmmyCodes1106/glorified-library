import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "glorified_session";
const MEMBER_SESSION_COOKIE = "glorified_member_session";

const PUBLIC_PATHS = new Set([
  "/login",
  "/login/code",
  "/login/verify",
  "/setup",
  "/forgot-password",
  "/reset-password",
  "/register",
  "/verify-email",
  "/forbidden",
]);

const MEMBER_PUBLIC_PATHS = new Set([
  "/member/login",
  "/member/register",
  "/member/forgot-password",
]);

// Cookie presence only. Session validity and permissions are enforced in the
// data access layer and in every server action / route handler.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isMemberPath = pathname === "/member" || pathname.startsWith("/member/");

  if (isMemberPath) {
    const memberSignedIn = Boolean(
      request.cookies.get(MEMBER_SESSION_COOKIE)?.value
    );
    if (!memberSignedIn && !MEMBER_PUBLIC_PATHS.has(pathname)) {
      const login = new URL("/member/login", request.url);
      if (pathname !== "/member") login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  }

  const signedIn = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.has(pathname);

  if (!signedIn && !isPublic) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
