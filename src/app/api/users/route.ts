import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, createUser, setUserPassword } from "@/lib/local/auth";
import { getDatabase } from "@/lib/local/database";
import { localRedirectUrl } from "@/lib/local/redirect-url";
import { sameOrigin, safeRedirectPath } from "@/lib/security";
import { auditAction } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const trim = (value: unknown) => String(value ?? "").trim();
const redirectWith = (req: NextRequest, path: string, key?: string, value?: string) => {
  const url = localRedirectUrl(req, path);
  if (key && value) url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
};

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return redirectWith(req, "/login");
  if (!sameOrigin(req)) return new NextResponse("Geçersiz istek", { status: 403 });

  const fd = await req.formData();
  const operation = trim(fd.get("operation"));
  const back = safeRedirectPath(fd.get("return_to"), "/kullanicilar");
  const db = getDatabase();
  const now = new Date().toISOString();

  try {
    if (operation === "create") {
      const firstName = trim(fd.get("first_name"));
      const lastName = trim(fd.get("last_name"));
      const username = trim(fd.get("username"));
      const email = trim(fd.get("email"));
      const password = String(fd.get("password") ?? "");
      const passwordAgain = String(fd.get("password_again") ?? "");
      const active = trim(fd.get("is_active")) !== "0";

      if (!firstName || !lastName || !username || !email || !password || !passwordAgain) {
        return redirectWith(req, back, "error", "Ad, soyad, kullanıcı adı, e-posta ve şifre alanları zorunludur.");
      }
      if (password.length < 8) return redirectWith(req, back, "error", "Şifre en az 8 karakter olmalıdır.");
      if (password !== passwordAgain) return redirectWith(req, back, "error", "Şifre ve şifre tekrar alanları eşleşmiyor.");

      const created = await createUser({ firstName, lastName, username, email, password });
      if (!active) db.prepare("UPDATE users SET is_active=0,updated_at=? WHERE id=?").run(now, created.id);
      auditAction(currentUser, "Kullanıcı Oluşturuldu", "user", created.id, username, null, {
        first_name: firstName,
        last_name: lastName,
        username,
        email: email.toLowerCase(),
        is_active: active,
      });
      return redirectWith(req, back, "saved", "created");
    }

    const userId = trim(fd.get("user_id"));
    const row = db.prepare("SELECT * FROM users WHERE id=?").get(userId) as any;
    if (!row) return redirectWith(req, back, "error", "Kullanıcı bulunamadı.");

    if (operation === "update") {
      const firstName = trim(fd.get("first_name"));
      const lastName = trim(fd.get("last_name"));
      const username = trim(fd.get("username"));
      const email = trim(fd.get("email")).toLowerCase();
      const active = trim(fd.get("is_active")) !== "0";
      if (!firstName || !lastName || !username || !email) {
        return redirectWith(req, back, "error", "Ad, soyad, kullanıcı adı ve e-posta alanları zorunludur.");
      }
      if (!active && userId === currentUser.id) {
        return redirectWith(req, back, "error", "Kendi kullanıcı hesabınızı pasife alamazsınız.");
      }
      if (!active) {
        const activeCount = Number((db.prepare("SELECT count(*) c FROM users WHERE is_active=1 AND id<>?").get(userId) as any)?.c || 0);
        if (activeCount < 1) return redirectWith(req, back, "error", "Sistemde en az bir aktif kullanıcı bulunmalıdır.");
      }
      db.prepare("UPDATE users SET first_name=?,last_name=?,username=?,email=?,is_active=?,updated_at=? WHERE id=?")
        .run(firstName, lastName, username, email, active ? 1 : 0, now, userId);
      if (!active) db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
      auditAction(currentUser, "Kullanıcı Güncellendi", "user", userId, username, row, {
        ...row,
        first_name: firstName,
        last_name: lastName,
        username,
        email,
        is_active: active ? 1 : 0,
      });
      return redirectWith(req, back, "saved", "updated");
    }

    if (operation === "toggle") {
      const nextActive = !Boolean(row.is_active);
      if (!nextActive && userId === currentUser.id) {
        return redirectWith(req, back, "error", "Kendi kullanıcı hesabınızı pasife alamazsınız.");
      }
      if (!nextActive) {
        const activeCount = Number((db.prepare("SELECT count(*) c FROM users WHERE is_active=1 AND id<>?").get(userId) as any)?.c || 0);
        if (activeCount < 1) return redirectWith(req, back, "error", "Sistemde en az bir aktif kullanıcı bulunmalıdır.");
      }
      db.prepare("UPDATE users SET is_active=?,updated_at=? WHERE id=?").run(nextActive ? 1 : 0, now, userId);
      if (!nextActive) db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
      auditAction(currentUser, nextActive ? "Kullanıcı Aktifleştirildi" : "Kullanıcı Pasife Alındı", "user", userId, row.username, row, {
        ...row,
        is_active: nextActive ? 1 : 0,
      });
      return redirectWith(req, back, "saved", nextActive ? "activated" : "deactivated");
    }

    if (operation === "password") {
      const password = String(fd.get("password") ?? "");
      const passwordAgain = String(fd.get("password_again") ?? "");
      if (password.length < 8) return redirectWith(req, back, "error", "Yeni şifre en az 8 karakter olmalıdır.");
      if (password !== passwordAgain) return redirectWith(req, back, "error", "Yeni şifreler birbiriyle eşleşmiyor.");
      await setUserPassword(userId, password);
      auditAction(currentUser, "Kullanıcı Şifresi Değiştirildi", "user", userId, row.username, null, { password_changed: true });
      if (userId === currentUser.id) return redirectWith(req, "/login", "password", "changed");
      return redirectWith(req, back, "saved", "password");
    }

    return redirectWith(req, back, "error", "Bilinmeyen işlem.");
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.includes("zaten kullanımda") || message.includes("UNIQUE constraint failed: users")) {
      return redirectWith(req, back, "error", "E-posta veya kullanıcı adı zaten kullanımda.");
    }
    console.error("USER_MANAGEMENT_ERROR", operation, error);
    return redirectWith(req, back, "error", "İşlem sırasında bir sorun oluştu. Lütfen tekrar deneyin.");
  }
}
