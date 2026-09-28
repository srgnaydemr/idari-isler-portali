import { NextRequest, NextResponse } from "next/server";
import { localRedirectUrl } from "@/lib/local/redirect-url";
import { SESSION_COOKIE, signOut } from "@/lib/local/auth";
import { sameOrigin, secureCookieEnabled } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse("Geçersiz istek", { status: 403 });
  await signOut();
  const response = NextResponse.redirect(localRedirectUrl(req, "/login"), 303);
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookieEnabled(),
    path: "/",
    expires: new Date(0),
  });
  return response;
}
