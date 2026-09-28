import type {DatabaseSync} from "node:sqlite";
import {randomUUID} from "node:crypto";
import {isoToday} from "./rental-contracts";

/** Kiralama sözleşmesi geçmişini araç kartındaki bilgilerle eşitler. KM takip modülü içermez. */
export function expireRentalContracts(db:DatabaseSync,today=isoToday()){
  const stamp=new Date().toISOString();
  const rows=db.prepare(`SELECT c.id,c.vehicle_id,c.end_date,v.current_odometer
    FROM vehicle_rental_contracts c JOIN vehicles v ON v.id=c.vehicle_id
    WHERE c.status='ACTIVE' AND date(c.end_date)<date(?)`).all(today) as any[];
  const update=db.prepare("UPDATE vehicle_rental_contracts SET status='EXPIRED',closed_at=COALESCE(closed_at,?),end_odometer=COALESCE(end_odometer,?),updated_at=? WHERE id=?");
  for(const c of rows){
    const h=db.prepare("SELECT new_odometer FROM vehicle_odometer_history WHERE vehicle_id=? AND date(recorded_at)<=date(?) ORDER BY datetime(recorded_at) DESC LIMIT 1").get(c.vehicle_id,c.end_date) as any;
    const observed=h?.new_odometer==null?Number(c.current_odometer||0):Number(h.new_odometer);
    const endKm=Math.max(0,Number.isFinite(observed)?observed:Number(c.current_odometer||0));
    update.run(stamp,endKm,stamp,c.id);
  }
}

/** Araç Genel Bilgilerindeki kiralama sözleşmesi alanlarını geçmiş tablosuyla eşitler. */
export function syncVehicleRentalContract(db:DatabaseSync,vehicleId:string,userId?:string|null){
  const v=db.prepare("SELECT * FROM vehicles WHERE id=?").get(vehicleId) as any;if(!v)return null;
  const active=db.prepare("SELECT * FROM vehicle_rental_contracts WHERE vehicle_id=? AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1").get(vehicleId) as any;
  const complete=v.is_active&&v.ownership_type==='FLEET'&&v.fleet_company&&v.contract_start_date&&v.contract_end_date&&v.contract_km_limit!=null&&Number(v.contract_km_limit)>0;
  const now=new Date().toISOString(),current=Number(v.current_odometer||0);
  if(!complete){
    if(active)db.prepare("UPDATE vehicle_rental_contracts SET status='CLOSED',closed_by=?,closed_at=?,end_odometer=?,updated_at=? WHERE id=?").run(userId||null,now,current,now,active.id);
    return null;
  }
  if(String(v.contract_end_date)<=String(v.contract_start_date))throw new Error("Sözleşme bitiş tarihi başlangıç tarihinden sonra olmalıdır.");
  const targetStatus=String(v.contract_end_date)<isoToday()?"EXPIRED":"ACTIVE";
  const same=db.prepare("SELECT * FROM vehicle_rental_contracts WHERE vehicle_id=? AND start_date=? ORDER BY datetime(created_at) DESC LIMIT 1").get(vehicleId,v.contract_start_date) as any;

  if(same){
    if(active&&active.id!==same.id){
      db.prepare("UPDATE vehicle_rental_contracts SET status='CLOSED',closed_by=?,closed_at=?,end_odometer=?,updated_at=? WHERE id=?").run(userId||null,now,current,now,active.id);
    }
    db.prepare(`UPDATE vehicle_rental_contracts SET fleet_company=?,end_date=?,total_km_allowance=?,status=?,
      closed_by=CASE WHEN ?='ACTIVE' THEN NULL ELSE COALESCE(closed_by,?) END,
      closed_at=CASE WHEN ?='ACTIVE' THEN NULL ELSE COALESCE(closed_at,?) END,
      end_odometer=CASE WHEN ?='ACTIVE' THEN NULL ELSE COALESCE(end_odometer,?) END,
      updated_at=?,reference_source='CONTRACT_HISTORY' WHERE id=?`)
      .run(v.fleet_company,v.contract_end_date,Number(v.contract_km_limit),targetStatus,targetStatus,userId||null,targetStatus,now,targetStatus,current,now,same.id);
    return same.id;
  }

  if(active)db.prepare("UPDATE vehicle_rental_contracts SET status='CLOSED',closed_by=?,closed_at=?,end_odometer=?,updated_at=? WHERE id=?").run(userId||null,now,current,now,active.id);
  const id=randomUUID();
  db.prepare("INSERT INTO vehicle_rental_contracts(id,vehicle_id,fleet_company,start_date,end_date,start_odometer,total_km_allowance,status,notes,created_by,created_at,updated_at,reference_source,closed_at,end_odometer) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id,vehicleId,v.fleet_company,v.contract_start_date,v.contract_end_date,0,Number(v.contract_km_limit),targetStatus,"Araç Genel Bilgilerinden otomatik oluşturuldu.",userId||null,now,now,"CONTRACT_HISTORY",targetStatus==='EXPIRED'?now:null,targetStatus==='EXPIRED'?current:null);
  return id;
}
