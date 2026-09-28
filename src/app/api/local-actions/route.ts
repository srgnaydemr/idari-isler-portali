import { NextRequest, NextResponse } from "next/server";
import { localRedirectUrl } from "@/lib/local/redirect-url";
import { getCurrentUser } from "@/lib/local/auth";
import { createLocalServerClient } from "@/lib/local/client";
import { getDatabase } from "@/lib/local/database";
import { uploadAttachmentVersion } from "@/lib/attachment-upload";
import { sameOrigin, safeRedirectPath } from "@/lib/security";
import { logApplicationError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function red(req: NextRequest, path: string) { return NextResponse.redirect(localRedirectUrl(req, path), 303); }
function msg(m: string) { return encodeURIComponent(m.slice(0, 180)); }
function friendlyRpcMessage(raw?: string) {
  const x = String(raw || "");
  const map: Record<string,string> = {
    VEHICLE_NOT_FOUND: "Araç bulunamadı.", ASSIGNEE_REQUIRED: "Zimmetlenecek kişi zorunludur.",
    VEHICLE_IN_SERVICE: "Servisteki araca zimmet işlemi yapılamaz.", VEHICLE_NOT_AVAILABLE: "Araç zimmete uygun durumda değil.",
    ACTIVE_ASSIGNMENT_EXISTS: "Araçta zaten aktif bir zimmet bulunuyor.", ACTIVE_ASSIGNMENT_NOT_FOUND: "Aktif zimmet bulunamadı.",
    FUTURE_ASSIGNMENT_DATETIME: "Lütfen geçerli bir tarih ve saat giriniz. Zimmet tarihi ve saati mevcut tarih ve saatten ileri olamaz.",
    FUTURE_RETURN_DATETIME: "İade tarihi ve saati mevcut tarih ve saatten ileri olamaz.",
    RETURN_ODOMETER_BELOW_ASSIGNMENT: "İade kilometresi, aracın zimmet başlangıç kilometresinden düşük olamaz.",
    RETURN_ODOMETER_BELOW_CURRENT: "İade kilometresi aracın güncel kilometresinden düşük olamaz.",
    INVALID_RETURN_DATE: "İade tarihi teslim tarihinden önce olamaz."
  };
  return map[x] || "İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin.";
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return red(req, "/login");
  if (!sameOrigin(req)) return new NextResponse("Geçersiz istek", { status: 403 });

  const db = createLocalServerClient(user.id);
  let fd: FormData;
  try { fd = await req.formData(); } catch { return red(req, "/ana-panel?error=form"); }
  const op = String(fd.get("operation") || "");
  const back = safeRedirectPath(fd.get("return_to"), "/ana-panel");

  try {
    if (op === "create_assignment") {
      const vehicleId = String(fd.get("vehicle_id") || "");
      const { data, error } = await db.rpc("create_vehicle_assignment", {
        p_vehicle_id: vehicleId,
        p_assigned_to: String(fd.get("assigned_to") || "").trim(),
        p_delivered_by: String(fd.get("delivered_by") || "").trim() || null,
        p_delivery_date: String(fd.get("delivery_date") || ""),
        p_delivery_odometer: Number(fd.get("delivery_odometer") || 0) || null,
        p_vehicle_condition: String(fd.get("condition") || "").trim() || null,
        p_description: String(fd.get("description") || "").trim() || null,
      });
      if (error) return red(req, `/araclar/${vehicleId}/zimmet?error=${msg(friendlyRpcMessage(error.message))}`);

      const assignmentId = String(data);
      const file = fd.get("file");
      if (file instanceof File && file.size > 0) {
        try {
          await uploadAttachmentVersion({ userId: user.id, file, entityType: "assignment", entityId: assignmentId, description: "Zimmet belgesi" });
        } catch (uploadError) {
          // Dosya zorunlu/istenmişse yarım zimmet bırakma: kaydı ve araç sorumlusunu geri al.
          const sql = getDatabase();
          sql.exec("BEGIN IMMEDIATE");
          try {
            sql.prepare("DELETE FROM vehicle_assignments WHERE id=?").run(assignmentId);
            sql.prepare("DELETE FROM vehicle_status_history WHERE vehicle_id=? AND new_status='ASSIGNED' AND description='Araç zimmetlendi'").run(vehicleId);
            sql.prepare("UPDATE vehicles SET responsible_person=NULL,status='ACTIVE',updated_by=?,updated_at=? WHERE id=?").run(user.id, new Date().toISOString(), vehicleId);
            sql.exec("COMMIT");
          } catch { try { sql.exec("ROLLBACK"); } catch {} }
          throw uploadError;
        }
      }
      return red(req, `/araclar/${vehicleId}/zimmet?saved=1`);
    }

    if (op === "return_assignment") {
      const vehicleId = String(fd.get("vehicle_id") || "");
      const assignmentId = String(fd.get("assignment_id") || "");
      const { error } = await db.rpc("return_vehicle_assignment", {
        p_assignment_id: assignmentId,
        p_return_date: String(fd.get("return_date") || ""),
        p_return_odometer: fd.get("return_odometer") === "" || fd.get("return_odometer") == null ? null : Number(fd.get("return_odometer")),
        p_returned_to: String(fd.get("returned_to") || "").trim() || null,
        p_vehicle_condition: String(fd.get("return_condition") || "").trim() || null,
        p_description: String(fd.get("return_description") || "").trim() || null,
      });
      if (error) return red(req, `/araclar/${vehicleId}/zimmet?error=${msg(friendlyRpcMessage(error.message))}`);
      const file = fd.get("file");
      if (file instanceof File && file.size > 0) {
        try { await uploadAttachmentVersion({ userId: user.id, file, entityType: "assignment", entityId: assignmentId, description: "Araç iade belgesi" }); }
        catch (e) { logApplicationError("vehicle_return_attachment", e, user.id); }
      }
      return red(req, `/araclar/${vehicleId}/zimmet?saved=1`);
    }

    return red(req, "/ana-panel?error=unknown_operation");
  } catch (e) {
    logApplicationError(`local_action:${op}`, e, user.id);
    return red(req, `${back}${back.includes("?") ? "&" : "?"}error=${msg("İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin.")}`);
  }
}
