import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export function newVehicleQrToken(){return randomBytes(32).toString("base64url")}

export function normalizeQrToken(value:unknown){
  const token=String(value||"").trim();
  return /^[A-Za-z0-9_-]{40,80}$/.test(token)?token:"";
}

function qrEligibleVehicle(db:DatabaseSync,vehicleId:string){
  const vehicle=db.prepare("SELECT id,is_active,is_replacement FROM vehicles WHERE id=?").get(vehicleId) as any;
  if(!vehicle)throw new Error("Araç bulunamadı.");
  if(Number(vehicle.is_replacement))throw new Error("İkame araçlar Araç QR / KM Güncelleme sistemine dahil edilemez.");
  return vehicle;
}

export function ensureVehicleQr(db:DatabaseSync,vehicleId:string,userId?:string|null){
  const vehicle=qrEligibleVehicle(db,vehicleId);
  if(!Number(vehicle.is_active))throw new Error("Pasif araç için QR oluşturulamaz.");
  const existing=db.prepare("SELECT * FROM vehicle_qr_codes WHERE vehicle_id=?").get(vehicleId) as any;
  if(existing)return existing;
  const now=new Date().toISOString(),id=randomUUID(),token=newVehicleQrToken();
  db.prepare("INSERT INTO vehicle_qr_codes(id,vehicle_id,token,is_active,created_by,created_at,updated_at) VALUES(?,?,?,1,?,?,?)").run(id,vehicleId,token,userId||null,now,now);
  return db.prepare("SELECT * FROM vehicle_qr_codes WHERE id=?").get(id) as any;
}

export function bulkCreateMissingVehicleQrs(db:DatabaseSync,userId?:string|null){
  const rows=db.prepare("SELECT id FROM vehicles WHERE is_active=1 AND is_replacement=0 AND NOT EXISTS(SELECT 1 FROM vehicle_qr_codes q WHERE q.vehicle_id=vehicles.id) ORDER BY plate").all() as any[];
  for(const row of rows)ensureVehicleQr(db,String(row.id),userId);
  return rows.length;
}

export function rotateVehicleQr(db:DatabaseSync,vehicleId:string,userId?:string|null){
  const vehicle=qrEligibleVehicle(db,vehicleId);
  if(!Number(vehicle.is_active))throw new Error("Pasif aracın QR kodu yenilenemez.");
  const current=ensureVehicleQr(db,vehicleId,userId),now=new Date().toISOString(),token=newVehicleQrToken();
  db.prepare("UPDATE vehicle_qr_codes SET token=?,is_active=1,rotated_at=?,disabled_at=NULL,updated_at=? WHERE id=?").run(token,now,now,current.id);
  return db.prepare("SELECT * FROM vehicle_qr_codes WHERE id=?").get(current.id) as any;
}

export function setVehicleQrActive(db:DatabaseSync,vehicleId:string,active:boolean){
  const vehicle=qrEligibleVehicle(db,vehicleId);
  const qr=db.prepare("SELECT * FROM vehicle_qr_codes WHERE vehicle_id=?").get(vehicleId) as any;
  if(!qr)throw new Error("Bu araç için QR kodu bulunmuyor.");
  if(active&&!Number(vehicle.is_active))throw new Error("Pasif araç için QR etkinleştirilemez.");
  const now=new Date().toISOString();
  db.prepare("UPDATE vehicle_qr_codes SET is_active=?,disabled_at=?,updated_at=? WHERE id=?").run(active?1:0,active?null:now,now,qr.id);
}

export function qrPublicOriginFromHeaders(headers:Headers,requestOrigin?:string){
  const configured=String(process.env.PORTAL_PUBLIC_URL||"").trim().replace(/\/+$/g,"");
  if(configured)return configured;
  const forwardedHost=headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host=forwardedHost||headers.get("host")?.trim();
  const forwardedProto=headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto=forwardedProto||((requestOrigin||"").startsWith("https://")?"https":"http");
  if(host)return `${proto}://${host}`;
  return String(requestOrigin||"").replace(/\/+$/g,"");
}

export function vehicleQrPublicUrl(origin:string,token:string){return `${String(origin).replace(/\/+$/g,"")}/q/${encodeURIComponent(token)}`}
