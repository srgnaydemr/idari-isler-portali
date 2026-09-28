import { NextRequest, NextResponse } from "next/server";
import { localRedirectUrl } from "@/lib/local/redirect-url";
import { createInitialUser, hasUsers } from "@/lib/local/auth";
import { sameOrigin } from "@/lib/security";
import { logApplicationError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse("Geçersiz istek", { status: 403 });
  try {
    if (await hasUsers()) return NextResponse.redirect(localRedirectUrl(req, "/login"), 303);
    const fd = await req.formData();
    await createInitialUser({
      firstName: String(fd.get("first_name") || "").trim(),
      lastName: String(fd.get("last_name") || "").trim(),
      username: String(fd.get("username") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      password: String(fd.get("password") || ""),
    });
    if (!(await hasUsers())) throw new Error("Kullanıcı veritabanına kaydedilemedi.");
    return NextResponse.redirect(localRedirectUrl(req, "/login?created=1"), 303);
  } catch (error) {
    const message = error instanceof Error && /zorunludur|kullanımda|oluşturulmuş/.test(error.message) ? error.message : "Kullanıcı oluşturulamadı. Lütfen tekrar deneyin.";
    logApplicationError("setup", error, null, "SETUP_ERROR");
    const url = localRedirectUrl(req, "/setup");
    url.searchParams.set("error", message);
    return NextResponse.redirect(url, 303);
  }
}
