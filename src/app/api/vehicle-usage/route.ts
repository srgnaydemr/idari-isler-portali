import {NextRequest,NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {getCurrentUser} from "@/lib/local/auth";
import {getDatabase} from "@/lib/local/database";
import {localRedirectUrl} from "@/lib/local/redirect-url";
import {sameOrigin,safeRedirectPath} from "@/lib/security";
import {auditAction} from "@/lib/audit";
import {calculateVehicleActiveStatus,reconcileVehicleActiveStatus,updateCentralVehicleOdometer} from "@/lib/local/vehicle-state";
export const runtime="nodejs";export const dynamic="force-dynamic";
const t=(v:any)=>String(v??"").trim();const nil=(v:any)=>t(v)||null;
function trToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
function trNowLocal(){const parts=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date());const o=Object.fromEntries(parts.map(x=>[x.type,x.value]));return`${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`}
function future(v:string){return !!v&&v.slice(0,16)>trNowLocal()}
function go(req:NextRequest,path:string,key?:string,val?:string){const u=localRedirectUrl(req,path);if(key&&val)u.searchParams.set(key,val);return NextResponse.redirect(u,303)}
export async function POST(req:NextRequest){const user=await getCurrentUser();if(!user)return go(req,"/login");if(!sameOrigin(req))return new NextResponse("Geçersiz istek",{status:403});const fd=await req.formData(),op=t(fd.get("operation")),back=safeRedirectPath(fd.get("return_to"),"/arac-kullanim-teslim"),db=getDatabase(),now=new Date().toISOString();try{
 if(op==="checkout"){
  const vehicleId=t(fd.get("vehicle_id")),personId=t(fd.get("personnel_id")),checkout=t(fd.get("checkout_at")),km=Number(fd.get("checkout_odometer"));
  if(!vehicleId||!personId||!checkout||!Number.isFinite(km))return go(req,back,"error","Araç, personel, teslim tarihi/saati ve kilometre zorunludur.");
  if(future(checkout))return go(req,back,"error","Teslim tarihi ve saati mevcut zamandan ileri olamaz.");
  const v=db.prepare("SELECT * FROM vehicles WHERE id=? AND is_active=1").get(vehicleId) as any,p=db.prepare("SELECT * FROM personnel WHERE id=? AND status='ACTIVE' AND deleted_at IS NULL").get(personId) as any;
  if(!v)return go(req,back,"error","Aktif araç bulunamadı.");if(!p)return go(req,back,"error","Aktif personel bulunamadı.");const activeStatus=calculateVehicleActiveStatus(db,vehicleId);if(!["ACTIVE","ASSIGNED","REPLACEMENT"].includes(activeStatus))return go(req,back,"error","Araç mevcut durumunda geçici kullanıma verilemez.");
  const busy=db.prepare("SELECT vu.*,p.first_name,p.last_name FROM vehicle_usage_records vu LEFT JOIN personnel p ON p.id=vu.personnel_id WHERE vu.vehicle_id=? AND vu.status='IN_USE' AND vu.return_at IS NULL LIMIT 1").get(vehicleId) as any;
  if(busy)return go(req,back,"error",`Bu araç şu anda ${(busy.personnel_name_snapshot||`${busy.first_name||''} ${busy.last_name||''}`.trim())} kullanımındadır. Araç iade alınmadan yeni kullanım kaydı oluşturulamaz.`);
  if(!t(fd.get("checkout_odometer"))&&!v.is_replacement)return go(req,back,"error","Normal araç için teslim KM zorunludur.");if(t(fd.get("checkout_odometer"))&&(!Number.isSafeInteger(km)||km<0))return go(req,back,"error","KM pozitif bir tam sayı olmalı.");if(t(fd.get("checkout_odometer"))&&km<Number(v.current_odometer||0))return go(req,back,"error",`Teslim kilometresi aracın mevcut kilometresinden düşük olamaz. Güncel KM: ${v.current_odometer||0}`);
  const id=randomUUID(),name=`${p.first_name} ${p.last_name}`.trim();db.exec("BEGIN IMMEDIATE");try{
    db.prepare("INSERT INTO vehicle_usage_records(id,vehicle_id,personnel_id,personnel_name_snapshot,department_snapshot,checkout_at,checkout_odometer,purpose,description,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'IN_USE',?,?,?)").run(id,vehicleId,personId,name,p.department||null,checkout,km,nil(fd.get("purpose")),nil(fd.get("description")),user.id,now,now);
    db.prepare("UPDATE vehicle_usage_records SET checkout_km_known=? WHERE id=?").run(t(fd.get("checkout_odometer"))?1:0,id);
    if(t(fd.get("checkout_odometer"))&&!v.is_replacement)updateCentralVehicleOdometer(db,vehicleId,km,user.id,"Günlük araç teslim kilometresi");
    reconcileVehicleActiveStatus(db,vehicleId,user.id,"Araç geçici kullanıma teslim edildi");
    db.exec("COMMIT");
  }catch(e){try{db.exec("ROLLBACK")}catch{}throw e}
  auditAction(user,"Araç Personele Teslim Edildi","vehicle_usage",id,v.plate,null,{vehicle_id:vehicleId,personnel_id:personId,personnel_name:name,checkout_at:checkout,checkout_odometer:km});return go(req,back,"saved","checkout");
 }
 if(op==="return"){
  const id=t(fd.get("usage_id")),row=db.prepare("SELECT * FROM vehicle_usage_records WHERE id=? AND status='IN_USE' AND return_at IS NULL").get(id) as any;if(!row)return go(req,back,"error","Aktif araç kullanım kaydı bulunamadı.");
  const ret=t(fd.get("return_at")),km=t(fd.get("return_odometer"))?Number(fd.get("return_odometer")):null;if(!ret||(km!==null&&(!Number.isSafeInteger(km)||km<0)))return go(req,back,"error","İade tarihi/saati ve iade kilometresi zorunludur.");
  if(ret.slice(0,16)<String(row.checkout_at).slice(0,16))return go(req,back,"error","İade tarihi teslim tarihinden önce olamaz.");if(future(ret))return go(req,back,"error","Gerçek iade tarihi ileri bir zaman olamaz.");if(km!==null&&km<Number(row.checkout_odometer))return go(req,back,"error","İade kilometresi teslim kilometresinden düşük olamaz.");
  const v=db.prepare("SELECT * FROM vehicles WHERE id=?").get(row.vehicle_id) as any;if(v&&!v.is_replacement&&km===null)return go(req,back,"error","Normal araç için iade KM zorunludur.");if(v&&km!==null&&km<Number(v.current_odometer||0))return go(req,back,"error",`İade kilometresi aracın güncel kilometresinden düşük olamaz. Güncel KM: ${v.current_odometer||0}`);db.exec("BEGIN IMMEDIATE");try{
    db.prepare("UPDATE vehicle_usage_records SET return_at=?,return_odometer=?,return_note=?,status='COMPLETED',returned_by=?,updated_at=? WHERE id=?").run(ret,km,nil(fd.get("return_note")),user.id,now,id);
    if(v){if(km!==null&&!v.is_replacement)updateCentralVehicleOdometer(db,row.vehicle_id,km,user.id,"Günlük araç iade kilometresi");reconcileVehicleActiveStatus(db,row.vehicle_id,user.id,"Geçici araç kullanımı tamamlandı");}
    db.exec("COMMIT");
  }catch(e){try{db.exec("ROLLBACK")}catch{}throw e}
  auditAction(user,"Araç İade Alındı","vehicle_usage",id,v?.plate||row.vehicle_id,row,{...row,return_at:ret,return_odometer:km,status:"COMPLETED"});return go(req,back,"saved","return");
 }
 return go(req,back,"error","Bilinmeyen işlem.");
}catch(e:any){console.error("VEHICLE_USAGE_ERROR",op,e);const m=String(e?.message||"");if(m.includes("uq_vehicle_usage_active")||m.includes("UNIQUE constraint failed: vehicle_usage_records.vehicle_id"))return go(req,back,"error","Bu araç şu anda başka bir personelde kullanımda.");return go(req,back,"error","İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin.")}}
