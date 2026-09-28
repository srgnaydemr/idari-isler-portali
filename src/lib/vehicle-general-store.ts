import {randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {reconcileVehicleActiveStatus} from "./local/vehicle-state";
import {syncVehicleRentalContract} from "./rental-contract-store";

export type VehicleGeneralUpdate=Record<string,unknown>;

function dbValue(v:unknown){if(typeof v==="boolean")return v?1:0;return v as any}
function userName(db:DatabaseSync,userId:string|null|undefined){if(!userId)return null;const u=db.prepare("SELECT first_name,last_name,username FROM users WHERE id=?").get(userId) as any;return u?`${String(u.first_name||"")} ${String(u.last_name||"")}`.trim()||String(u.username||""):null}
function columnSet(db:DatabaseSync){return new Set((db.prepare("PRAGMA table_info(vehicles)").all() as any[]).map(x=>String(x.name)))}

/** Araç genel bilgileri + sözleşme eşitlemesini tek atomik işlemde kaydeder. */
export function updateVehicleGeneralRecord(db:DatabaseSync,vehicleId:string,userId:string,payload:VehicleGeneralUpdate){
  const old=db.prepare("SELECT * FROM vehicles WHERE id=?").get(vehicleId) as any;
  if(!old)throw new Error("VEHICLE_NOT_FOUND");
  const columns=columnSet(db),data:any={...payload,updated_by:userId,updated_at:new Date().toISOString()};
  const keys=Object.keys(data).filter(k=>columns.has(k)&&k!=="id"&&k!=="created_at"&&k!=="created_by");
  if(!keys.length)throw new Error("NO_FIELDS_TO_UPDATE");
  db.exec("BEGIN IMMEDIATE");
  try{
    db.prepare(`UPDATE vehicles SET ${keys.map(k=>`${k}=?`).join(",")} WHERE id=?`).run(...keys.map(k=>dbValue(data[k])),vehicleId);
    syncVehicleRentalContract(db,vehicleId,userId);
    reconcileVehicleActiveStatus(db,vehicleId,userId,"Araç genel bilgileri güncellendi; merkezi durum yeniden hesaplandı");
    const fresh=db.prepare("SELECT * FROM vehicles WHERE id=?").get(vehicleId) as any;
    db.prepare("INSERT INTO audit_logs(id,created_at,user_id,user_name_snapshot,module,action,entity_type,entity_id,entity_reference,old_values,new_values,description,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(randomUUID(),new Date().toISOString(),userId,userName(db,userId),"vehicles","Güncellendi","vehicles",vehicleId,String(fresh?.plate||old?.plate||""),JSON.stringify(old),JSON.stringify(fresh),"Araç genel ve kiralama / sözleşme bilgileri güncellendi.",randomUUID());
    db.exec("COMMIT");
    return fresh;
  }catch(e){
    try{db.exec("ROLLBACK")}catch{}
    throw e;
  }
}

export function vehicleUpdateErrorMessage(error:unknown){
  const m=String((error as any)?.message||error||"");
  if(m.includes("UNIQUE constraint failed: vehicles.plate"))return "Bu plaka başka bir araçta kayıtlı.";
  if(m.includes("UNIQUE constraint failed: vehicles.vin"))return "Bu şasi numarası başka bir araçta kayıtlı.";
  if(m.includes("Sözleşme bitiş tarihi"))return "Sözleşme bitiş tarihi başlangıç tarihinden sonra olmalıdır.";
  if(m.includes("database is locked"))return "Veritabanı şu anda başka bir işlem tarafından kullanılıyor. Lütfen birkaç saniye sonra tekrar deneyin.";
  if(m.includes("VEHICLE_NOT_FOUND"))return "Araç kaydı bulunamadı.";
  return "Araç bilgileri kaydedilemedi. Girilen bilgileri kontrol edip tekrar deneyin.";
}
