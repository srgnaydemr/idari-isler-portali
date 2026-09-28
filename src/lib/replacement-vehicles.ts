import { randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/local/database";
import { auditAction } from "@/lib/audit";
import { reconcileVehicleActiveStatus } from "@/lib/local/vehicle-state";

export type ReplacementSourceType = "SERVICE" | "ACCIDENT" | "DAMAGE";

type ReplacementUser = { id?: string | null; first_name?: string | null; last_name?: string | null; username?: string | null; email?: string | null };

type Context = {
  sourceType: ReplacementSourceType;
  sourceId: string;
  vehicleId: string;
  user: ReplacementUser;
};

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}
function nullable(value: FormDataEntryValue | null) {
  const v = text(value);
  return v || null;
}
function plate(value: FormDataEntryValue | null) {
  return text(value).toUpperCase().replace(/\s+/g, " ");
}
function optionalKm(value: FormDataEntryValue | null) {
  const v = text(value);
  if (!v) return null;
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("KM bilgisi pozitif tam sayı olmalıdır.");
  return n;
}
function localDateTime(value: FormDataEntryValue | null, label: string, required = false) {
  const v = text(value);
  if (!v) {
    if (required) throw new Error(`${label} zorunludur.`);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new Error(`${label} geçerli tarih ve saat olmalıdır.`);
  const parsed = new Date(`${v}:00+03:00`);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} geçerli tarih ve saat olmalıdır.`);
  if (parsed.getTime() > Date.now()) throw new Error(`${label} ileri tarih olamaz.`);
  return v;
}
function activeForSource(db: ReturnType<typeof getDatabase>, sourceType: ReplacementSourceType, sourceId: string) {
  return db.prepare("SELECT * FROM vehicle_replacement_records WHERE source_type=? AND source_id=? AND status='ACTIVE' ORDER BY created_at DESC,id DESC LIMIT 1").get(sourceType, sourceId) as any;
}
function rowById(db: ReturnType<typeof getDatabase>, id: string) {
  return db.prepare("SELECT * FROM vehicle_replacement_records WHERE id=?").get(id) as any;
}
function assertContext(row: any, ctx: Context) {
  if (!row || row.source_type !== ctx.sourceType || row.source_id !== ctx.sourceId || row.vehicle_id !== ctx.vehicleId) throw new Error("İkame kaydı bu işlemle eşleşmiyor.");
}
function syncLegacySource(db: ReturnType<typeof getDatabase>, row: any) {
  const now = new Date().toISOString();
  if (row.source_type === "SERVICE") {
    db.prepare(`UPDATE vehicle_service_records SET replacement_vehicle_provided=1,replacement_plate=?,replacement_received_at=?,replacement_returned_at=?,replacement_company=?,replacement_notes=?,updated_at=? WHERE id=?`)
      .run(row.replacement_plate,row.replacement_received_at,row.replacement_returned_at,row.replacement_company,row.replacement_notes,now,row.source_id);
  } else if (row.source_type === "DAMAGE") {
    db.prepare(`UPDATE vehicle_damages SET replacement_plate=?,replacement_received_at=?,replacement_returned_at=?,replacement_company=?,replacement_notes=?,updated_at=? WHERE id=?`)
      .run(row.replacement_plate,row.replacement_received_at,row.replacement_returned_at,row.replacement_company,row.replacement_notes,now,row.source_id);
  }
}
function createInside(db: ReturnType<typeof getDatabase>, ctx: Context, fd: FormData, prefix = "") {
  if (activeForSource(db, ctx.sourceType, ctx.sourceId)) throw new Error("Bu servis / dosya için zaten aktif ikame araç bulunmaktadır. Önce mevcut ikameyi iade edin veya değiştirin.");
  const p = plate(fd.get(`${prefix}replacement_plate`));
  if (!p) throw new Error("İkame araç plakası zorunludur.");
  const received = localDateTime(fd.get(`${prefix}replacement_received_at`), "İkame başlangıç tarihi / saati", true);
  const startKm = optionalKm(fd.get(`${prefix}replacement_odometer`));
  const id = randomUUID(), now = new Date().toISOString();
  db.prepare(`INSERT INTO vehicle_replacement_records(
      id,vehicle_id,source_type,source_id,replacement_plate,replacement_received_at,replacement_returned_at,
      replacement_company,replacement_notes,status,created_by,updated_by,created_at,updated_at,replacement_odometer,
      replacement_brand_model,replacement_return_odometer,return_reason,return_notes
    ) VALUES(?,?,?,?,?,?,NULL,?,?,'ACTIVE',?,?,?,?,?,?,NULL,NULL,NULL)`)
    .run(id,ctx.vehicleId,ctx.sourceType,ctx.sourceId,p,received,nullable(fd.get(`${prefix}replacement_company`)),nullable(fd.get(`${prefix}replacement_notes`)),ctx.user.id||null,ctx.user.id||null,now,now,startKm,nullable(fd.get(`${prefix}replacement_brand_model`)));
  const created = rowById(db,id);
  if (created?.replacement_vehicle_id) reconcileVehicleActiveStatus(db, String(created.replacement_vehicle_id), ctx.user.id||null, "İkame araç aktif durumu eşitlendi");
  syncLegacySource(db,created);
  auditAction(ctx.user,"İkame Araç Oluşturuldu","vehicle_replacement_records",id,p,null,created,"Yeni aktif ikame araç oluşturuldu.");
  return created;
}
function editInside(db: ReturnType<typeof getDatabase>, ctx: Context, fd: FormData) {
  const id=text(fd.get("record_id")), old=rowById(db,id);assertContext(old,ctx);
  if(old.status!=="ACTIVE")throw new Error("İade edilmiş ikame kaydı değiştirilemez. Geçmiş kayıt korunur.");
  const p=plate(fd.get("replacement_plate"));if(!p)throw new Error("İkame araç plakası zorunludur.");
  const received=localDateTime(fd.get("replacement_received_at"),"İkame başlangıç tarihi / saati",true);
  const startKm=optionalKm(fd.get("replacement_odometer"));
  const now=new Date().toISOString();
  if(old.replacement_vehicle_id && p.replace(/\s/g,"")!==String(old.replacement_plate).replace(/\s/g,"").toUpperCase()){
    const conflict=db.prepare("SELECT id,is_replacement FROM vehicles WHERE REPLACE(UPPER(plate),' ','')=REPLACE(UPPER(?),' ','') AND id<>? LIMIT 1").get(p,old.replacement_vehicle_id) as any;
    if(conflict)throw new Error(conflict.is_replacement?"Bu plaka başka bir ikame araç kaydında kullanılıyor.":"İkame plakası mevcut ana araçla çakışıyor.");
    db.prepare("UPDATE vehicles SET plate=?,updated_at=? WHERE id=? AND is_replacement=1").run(p,now,old.replacement_vehicle_id);
  }
  db.prepare(`UPDATE vehicle_replacement_records SET replacement_plate=?,replacement_received_at=?,replacement_company=?,replacement_notes=?,replacement_odometer=?,replacement_brand_model=?,updated_by=?,updated_at=? WHERE id=?`)
    .run(p,received,nullable(fd.get("replacement_company")),nullable(fd.get("replacement_notes")),startKm,nullable(fd.get("replacement_brand_model")),ctx.user.id||null,now,id);
  const updated=rowById(db,id);if(updated?.replacement_vehicle_id)reconcileVehicleActiveStatus(db,String(updated.replacement_vehicle_id),ctx.user.id||null,"İkame araç bilgileri sonrası durum eşitlendi");syncLegacySource(db,updated);
  auditAction(ctx.user,"İkame Araç Bilgileri Güncellendi","vehicle_replacement_records",id,p,old,updated,"Bilgi düzeltmesi; kayıt kimliği ve geçmiş ilişkileri korundu.");
  return updated;
}
function returnInside(db: ReturnType<typeof getDatabase>, ctx: Context, fd: FormData, prefix = "") {
  const id=text(fd.get(`${prefix}record_id`) || fd.get("record_id")), old=rowById(db,id);assertContext(old,ctx);
  if(old.status!=="ACTIVE")throw new Error("Bu ikame araç daha önce iade edilmiş.");
  const inUse=old.replacement_vehicle_id?db.prepare("SELECT 1 FROM vehicle_usage_records WHERE replacement_record_id=? AND status='IN_USE' AND return_at IS NULL LIMIT 1").get(old.id):null;
  if(inUse)throw new Error("İkame araç personelde kullanımda. Önce Araç Kullanım / Teslim bölümünden iade alın.");
  const returned=localDateTime(fd.get(`${prefix}replacement_returned_at`),"İade tarihi / saati",true);
  if(old.replacement_received_at && returned! && String(returned).slice(0,16)<String(old.replacement_received_at).slice(0,16))throw new Error("İade tarihi ikame başlangıç tarihinden önce olamaz.");
  const returnKm=optionalKm(fd.get(`${prefix}replacement_return_odometer`));
  if(returnKm!=null && old.replacement_odometer!=null && returnKm<Number(old.replacement_odometer))throw new Error("İade KM, başlangıç KM bilgisinden düşük olamaz.");
  const reason=nullable(fd.get(`${prefix}return_reason`));
  if(!reason)throw new Error("İade nedeni zorunludur.");
  const now=new Date().toISOString();
  db.prepare(`UPDATE vehicle_replacement_records SET replacement_returned_at=?,replacement_return_odometer=?,return_reason=?,return_notes=?,status='RETURNED',updated_by=?,updated_at=? WHERE id=?`)
    .run(returned,returnKm,reason,nullable(fd.get(`${prefix}return_notes`)),ctx.user.id||null,now,id);
  const updated=rowById(db,id);if(updated?.replacement_vehicle_id)reconcileVehicleActiveStatus(db,String(updated.replacement_vehicle_id),ctx.user.id||null,"İkame araç iadesi sonrası durum eşitlendi");syncLegacySource(db,updated);
  auditAction(ctx.user,"İkame Araç İade Edildi","vehicle_replacement_records",id,old.replacement_plate,old,updated,reason);
  return updated;
}

export function manageReplacement(ctx: Context, fd: FormData) {
  const db=getDatabase(),operation=text(fd.get("operation"));
  db.exec("BEGIN IMMEDIATE");
  try{
    let result:any;
    if(operation==="create") result=createInside(db,ctx,fd);
    else if(operation==="edit") result=editInside(db,ctx,fd);
    else if(operation==="return") result=returnInside(db,ctx,fd);
    else if(operation==="change") {
      returnInside(db,ctx,fd,"old_");
      result=createInside(db,ctx,fd,"new_");
      auditAction(ctx.user,"İkame Araç Değiştirildi","vehicle_replacement_records",result.id,result.replacement_plate,null,result,"Eski ikame iade edilerek yeni ikame ayrı kayıt olarak oluşturuldu.");
    } else throw new Error("Geçersiz ikame işlemi.");
    db.exec("COMMIT");
    return result;
  }catch(e){db.exec("ROLLBACK");throw e;}
}
