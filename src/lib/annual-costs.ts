import {getDatabase} from './local/database';
export const currentYear=()=>Number(new Intl.DateTimeFormat('en',{timeZone:'Europe/Istanbul',year:'numeric'}).format(new Date()));
export function annualCosts(vehicleId?:string) {
 const db=getDatabase();
 const year=(c:string)=>`CASE WHEN ${c} LIKE '%Z' OR substr(${c},-6,1) IN ('+','-') THEN YEAR(CONVERT_TZ(STR_TO_DATE(REPLACE(LEFT(${c},19),'T',' '),'%Y-%m-%d %H:%i:%s'),CASE WHEN RIGHT(${c},1)='Z' THEN '+00:00' ELSE RIGHT(${c},6) END,'+03:00')) ELSE substr(${c},1,4) END`;
 const union=[
  ['vehicle_maintenance','maintenance_date','cost','maintenance'],
  ['vehicle_service_records','service_in_at','cost','maintenance'],
  ['vehicle_accidents','accident_date','actual_cost','damage'],
  ['vehicle_damages','damage_date','cost','damage'],
  ['vehicle_traffic_fines','fine_date','amount','fine'],
  ['vehicle_tire_transactions','transaction_date','cost','tire'],
 ].map(([t,d,c,k])=>`SELECT vehicle_id,${year(d)} year,COALESCE(${c},0) cost,'${k}' kind FROM ${t}`).join(' UNION ALL ');
 return db.prepare(`SELECT c.vehicle_id,v.plate,CAST(c.year AS INTEGER) year,
   SUM(CASE WHEN kind='maintenance' THEN cost ELSE 0 END) maintenance,
   SUM(CASE WHEN kind='damage' THEN cost ELSE 0 END) damage,
   SUM(CASE WHEN kind='fine' THEN cost ELSE 0 END) fines,
   SUM(CASE WHEN kind='tire' THEN cost ELSE 0 END) tires,
   SUM(cost) total
   FROM (${union}) c JOIN vehicles v ON v.id=c.vehicle_id ${vehicleId?'WHERE c.vehicle_id=?':''}
   GROUP BY c.vehicle_id,c.year ORDER BY c.year DESC,v.plate`).all(...(vehicleId?[vehicleId]:[])) as any[];
}
