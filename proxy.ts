import { NextResponse, type NextRequest } from "next/server";
import { localRedirectUrl } from "@/lib/local/redirect-url";

const SESSION_COOKIE = "idari_portal_session";

/**
 * Giriş yapılmadan erişilebilmesi gereken rotalar.
 * İlk kurulum ve giriş POST istekleri burada özellikle public olmak zorunda;
 * aksi halde proxy bu istekleri /login'e yönlendirir ve form hiç çalışmaz.
 */
function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/setup" ||
    pathname.startsWith("/setup/") ||
    pathname === "/api/login" ||
    pathname === "/api/setup" ||
    pathname.startsWith("/q/") ||
    pathname === "/api/public/vehicle-km" ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/api/branding/logo" || pathname === "/api/branding/favicon"
  );
}

export default function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    return NextResponse.redirect(localRedirectUrl(request, "/login"));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
