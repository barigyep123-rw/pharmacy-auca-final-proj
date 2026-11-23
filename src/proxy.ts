import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "ubuzima_session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE)?.value;
  const isApi = pathname.startsWith("/api/");
  const isLogin = pathname === "/login" || pathname === "/api/auth/login";

  if (isLogin) {
    if (token && pathname === "/login") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (!token) {
    if (isApi) {
      return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
