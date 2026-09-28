import { NextRequest, NextResponse } from "next/server";
import { localRedirectUrl } from "@/lib/local/redirect-url";
import { getCurrentUser } from "@/lib/local/auth";
import { getDatabase } from "@/lib/local/database";
import { uploadAttachmentVersion } from "@/lib/attachment-upload";
import { sameOrigin, safeRedirectPath } from "@/lib/security";
import { logApplicationError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const entityTables: Record<string,string> = {
  vehicle: "vehicles",
  assignment: "vehicle_assignments",
  vehicle_service_record: "vehicle_service_records",
  vehicle_damage: "vehicle_damages",
  vehicle_accident: "vehicle_accidents",
  accident: "vehicle_accidents",
  personnel_assignment: "personnel_assignments",
  traffic_fine: "vehicle_traffic_fines",
};

function redirectWith(req: NextRequest, back: string, state: string, message?: string) {
  const u = localRedirectUrl(req, back);
  u.searchParams.set("upload", state);
  if (message) u.searchParams.set("upload_message", message.slice(0, 160));
  return NextResponse.redirect(u, 303);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(localRedirectUrl(req, "/login"), 303);
  if (!sameOrigin(req)) return new NextResponse("Geçersiz istek", { status: 403 });

  let back = "/ana-panel";
  try {
    const fd = await req.formData();
    const file = fd.get("file");
    const type = String(fd.get("entity_type") || "");
    const id = String(fd.get("entity_id") || "");
    back = safeRedirectPath(fd.get("return_to"), "/ana-panel");
    const attachmentId = String(fd.get("attachment_id") || "") || null;

    if (!(file instanceof File) || !file.size || !type || !id || !entityTables[type]) {
      return redirectWith(req, back, "missing", "Dosya veya kayıt bilgisi eksik.");
    }

    const table = entityTables[type];
    const exists = getDatabase().prepare(`SELECT 1 FROM ${table} WHERE id=? LIMIT 1`).get(id);
    if (!exists) return redirectWith(req, back, "error", "Dosyanın bağlanacağı kayıt bulunamadı.");

    await uploadAttachmentVersion({
      userId: user.id,
      file,
      entityType: type,
      entityId: id,
      description: String(fd.get("description") || "") || null,
      attachmentId,
    });
    return redirectWith(req, back, "ok");
  } catch (error: any) {
    logApplicationError("attachment_upload", error, user.id);
    const m = String(error?.message || "");
    const safeMessage = /Desteklenmeyen|Boş dosya|en fazla|geçersiz|bozuk|eşleşmiyor/.test(m)
      ? m
      : "Dosya yüklenemedi. Lütfen dosyayı kontrol edip tekrar deneyin.";
    return redirectWith(req, back, "error", safeMessage);
  }
}
