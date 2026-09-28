import { NextRequest, NextResponse } from "next/server";
import { localRedirectUrl } from "@/lib/local/redirect-url";
import { hasUsers, LoginRateLimitError, SESSION_COOKIE, signIn } from "@/lib/local/auth";
import { sameOrigin, secureCookieEnabled } from "@/lib/security";
import { logApplicationError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse("Geçersiz istek", { status: 403 });
  if (!(await hasUsers())) return NextResponse.redirect(localRedirectUrl(req, "/setup"), 303);

  const fd = await req.formData();
  const identifier = String(fd.get("identifier") || "").trim();
  const password = String(fd.get("password") || "");
  if (!identifier || !password) return NextResponse.redirect(localRedirectUrl(req, "/login?error=missing"), 303);

  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "local";
    const session = await signIn(identifier, password, ip);
    if (!session) return NextResponse.redirect(localRedirectUrl(req, "/login?error=invalid"), 303);

    const response = NextResponse.redirect(localRedirectUrl(req, "/ana-panel"), 303);
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookieEnabled(),
      path: "/",
      expires: session.expiresAt,
    });
    return response;
  } catch (error) {
    if (error instanceof LoginRateLimitError) return NextResponse.redirect(localRedirectUrl(req, "/login?error=locked"), 303);
    logApplicationError("login", error, null, "LOGIN_ERROR");
    return NextResponse.redirect(localRedirectUrl(req, "/login?error=generic"), 303);
  }
}
