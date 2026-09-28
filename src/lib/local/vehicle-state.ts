import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export type VehicleActiveStatus = "SERVICE"|"TEMP_IN_USE"|"ASSIGNED"|"DAMAGED"|"MAINTENANCE"|"INACTIVE"|"REPLACEMENT"|"ACTIVE";

function now(){ return new Date().toISOString(); }

/**
 * Tek araç -> tek aktif durum.
 * Öncelik: servis > geçici kullanım > zimmet > aktif hasar > özel temel durum > boşta.
 * Tamamlanmış/kapanmış hasar kayıtları aktif durumu etkilemez.
 */
export function calculateVehicleActiveStatus(db: DatabaseSync, vehicleId: string): VehicleActiveStatus {
  const vehicle = db.prepare("SELECT id,status,is_active,is_replacement FROM vehicles WHERE id=?").get(vehicleId) as any;
  if (!vehicle || !Number(vehicle.is_active)) return "INACTIVE";

  const hasService = Boolean(
    db.prepare("SELECT 1 FROM vehicle_service_records WHERE vehicle_id=? AND status='OPEN' LIMIT 1").get(vehicleId) ||
    db.prepare("SELECT 1 FROM case_services WHERE vehicle_id=? AND exit_at IS NULL LIMIT 1").get(vehicleId)
  );
  if (hasService) return "SERVICE";

  const hasUsage = Boolean(db.prepare("SELECT 1 FROM vehicle_usage_records WHERE vehicle_id=? AND status='IN_USE' AND return_at IS NULL LIMIT 1").get(vehicleId));
  if (hasUsage) return "TEMP_IN_USE";

  const hasAssignment = Boolean(db.prepare("SELECT 1 FROM vehicle_assignments WHERE vehicle_id=? AND return_date IS NULL LIMIT 1").get(vehicleId));
  if (hasAssignment) return "ASSIGNED";

  const hasActiveDamage = Boolean(
    db.prepare("SELECT 1 FROM vehicle_accidents WHERE vehicle_id=? AND status NOT IN ('COMPLETED','CLOSED') LIMIT 1").get(vehicleId) ||
    db.prepare("SELECT 1 FROM vehicle_damages WHERE vehicle_id=? AND COALESCE(status,'NEW') NOT IN ('COMPLETED','CLOSED') LIMIT 1").get(vehicleId)
  );
  if (hasActiveDamage) return "DAMAGED";

  if (Number(vehicle.is_replacement)) return "REPLACEMENT";
  if (["MAINTENANCE","INACTIVE","REPLACEMENT"].includes(String(vehicle.status))) return vehicle.status as VehicleActiveStatus;
  return "ACTIVE";
}

export function reconcileVehicleActiveStatus(db: DatabaseSync, vehicleId: string, userId?: string|null, description="Araç aktif durumu merkezi olarak eşitlendi") {
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id=?").get(vehicleId) as any;
  if (!vehicle) throw new Error("Araç bulunamadı.");
  const next = calculateVehicleActiveStatus(db, vehicleId);
  if (String(vehicle.status) === next) return next;
  const stamp=now();
  db.prepare("UPDATE vehicles SET status=?,updated_by=COALESCE(?,updated_by),updated_at=? WHERE id=?").run(next,userId||null,stamp,vehicleId);
  db.prepare("INSERT INTO vehicle_status_history(id,vehicle_id,old_status,new_status,description,changed_by,changed_at) VALUES(?,?,?,?,?,?,?)")
    .run(randomUUID(),vehicleId,vehicle.status,next,description,userId||null,stamp);
  return next;
}

export function reconcileAllVehicleStatuses(db: DatabaseSync, userId?: string|null) {
  const rows=db.prepare("SELECT id FROM vehicles").all() as any[];
  let changed=0;
  for(const row of rows){
    const before=(db.prepare("SELECT status FROM vehicles WHERE id=?").get(row.id) as any)?.status;
    const after=reconcileVehicleActiveStatus(db,String(row.id),userId,"Merkezi araç durum tutarlılık kontrolü");
    if(before!==after) changed++;
  }
  return changed;
}

/**
 * Tek merkezi KM kaynağı vehicles.current_odometer'dır.
 * Normal operasyonlarda daha düşük KM kabul edilmez. Sadece açıkça correctionReason verilirse düzeltme yapılabilir.
 */
export function updateCentralVehicleOdometer(db: DatabaseSync, vehicleId: string, newOdometer: unknown, userId?: string|null, description="Güncel KM güncellendi", correctionReason?: string|null) {
  const vehicle=db.prepare("SELECT * FROM vehicles WHERE id=? AND is_active=1").get(vehicleId) as any;
  if(!vehicle) throw new Error("Araç bulunamadı.");
  const value=Number(newOdometer);
  if(!Number.isSafeInteger(value)||value<0) throw new Error("Güncel KM zorunludur ve pozitif tam sayı olmalıdır.");
  const current=Number(vehicle.current_odometer||0);
  const correction=value<current;
  if(correction&&!String(correctionReason||"").trim()) throw new Error("Girilen kilometre aracın mevcut güncel kilometresinden düşük olamaz.");
  if(value===current) return value;
  const stamp=now();
  db.prepare("INSERT INTO vehicle_odometer_history(id,vehicle_id,previous_odometer,new_odometer,is_correction,correction_reason,description,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(randomUUID(),vehicleId,current,value,correction?1:0,correction?String(correctionReason).trim():null,description,userId||null,stamp);
  db.prepare("UPDATE vehicles SET current_odometer=?,updated_by=COALESCE(?,updated_by),updated_at=? WHERE id=?").run(value,userId||null,stamp,vehicleId);
  return value;
}
