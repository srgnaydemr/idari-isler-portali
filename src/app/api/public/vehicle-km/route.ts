import {NextRequest,NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {getDatabase} from "@/lib/local/database";
import {updateCentralVehicleOdometer} from "@/lib/local/vehicle-state";
import {normalizeQrToken} from "@/lib/vehicle-qr";
import {sameOrigin} from "@/lib/security";
import {logApplicationError} from "@/lib/errors";

export const runtime="nodejs";
export const dynamic="force-dynamic";

function json(body:any,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"no-store, max-age=0"}})}
function fmt(n:number){return Math.round(n).toLocaleString("tr-TR")}
function clientIp(req:NextRequest){return String(req.headers.get("x-forwarded-for")||req.headers.get("x-real-ip")||"").split(",")[0].trim().slice(0,120)||null}

export async function POST(req:NextRequest){
  // QR sayfası public olsa da başka originlerden kör POST yapılmasını engelle.
  if(!sameOrigin(req))return json({ok:false,message:"Geçersiz istek."},403);
  let body:any;
  try{body=await req.json()}catch{return json({ok:false,message:"Geçersiz istek."},400)}
  const token=normalizeQrToken(body?.token);
  const value=Number(body?.odometer);
  const confirmed=body?.confirmHigh===true;
  if(!token)return json({ok:false,message:"QR bağlantısı geçersiz."},404);
  if(!Number.isSafeInteger(value)||value<0)return json({ok:false,message:"Lütfen geçerli bir kilometre değeri girin."},400);
  const db=getDatabase();
  const qr=db.prepare(`SELECT q.id qr_id,q.is_active,q.vehicle_id,v.plate,v.brand,v.model,v.current_odometer,v.is_active vehicle_active
    FROM vehicle_qr_codes q JOIN vehicles v ON v.id=q.vehicle_id WHERE q.token=? AND v.is_replacement=0 LIMIT 1`).get(token) as any;
  if(!qr||!Number(qr.is_active))return json({ok:false,message:"Bu QR kodu geçerli değil veya devre dışı bırakılmış."},404);
  if(!Number(qr.vehicle_active))return json({ok:false,message:"Bu araç pasif olduğu için kilometre güncellenemez."},403);
  const current=Number(qr.current_odometer||0);
  if(value<current)return json({ok:false,message:`Girilen kilometre aracın mevcut kilometresi olan ${fmt(current)} KM'den düşük olamaz.`},400);
  if(value===current)return json({ok:true,unchanged:true,message:`Araç kilometresi zaten ${fmt(current)} KM olarak kayıtlı.`,plate:qr.plate,currentOdometer:current});
  const threshold=Number((db.prepare("SELECT setting_value FROM system_settings WHERE setting_key='qr_high_km_warning_delta'").get() as any)?.setting_value||10000);
  const difference=value-current;
  if(difference>Math.max(1,threshold)&&!confirmed)return json({ok:false,requiresConfirmation:true,difference,currentOdometer:current,newOdometer:value,message:`Girdiğiniz kilometre mevcut değerden ${fmt(difference)} KM daha yüksek. Bu değeri kaydetmek istediğinizden emin misiniz?`},409);
  const now=new Date().toISOString();
  try{
    db.exec("BEGIN IMMEDIATE");
    const fresh=db.prepare(`SELECT q.id qr_id,q.is_active,q.vehicle_id,v.plate,v.current_odometer,v.is_active vehicle_active FROM vehicle_qr_codes q JOIN vehicles v ON v.id=q.vehicle_id WHERE q.token=? AND v.is_replacement=0 LIMIT 1`).get(token) as any;
    if(!fresh||!Number(fresh.is_active)||!Number(fresh.vehicle_active))throw new Error("QR_NOT_ACTIVE");
    const oldKm=Number(fresh.current_odometer||0);
    if(value<oldKm)throw new Error("KM_BELOW_CURRENT");
    if(value===oldKm){db.exec("ROLLBACK");return json({ok:true,unchanged:true,message:`Araç kilometresi zaten ${fmt(oldKm)} KM olarak kayıtlı.`,plate:fresh.plate,currentOdometer:oldKm})}
    const diff=value-oldKm;
    if(diff>Math.max(1,threshold)&&!confirmed){db.exec("ROLLBACK");return json({ok:false,requiresConfirmation:true,difference:diff,currentOdometer:oldKm,newOdometer:value,message:`Girdiğiniz kilometre mevcut değerden ${fmt(diff)} KM daha yüksek. Bu değeri kaydetmek istediğinizden emin misiniz?`},409)}
    updateCentralVehicleOdometer(db,String(fresh.vehicle_id),value,null,`QR üzerinden Güncel KM ${fmt(oldKm)} KM → ${fmt(value)} KM olarak güncellendi.`);
    db.prepare("INSERT INTO vehicle_qr_km_updates(id,qr_id,vehicle_id,previous_odometer,new_odometer,difference,source,ip_address,user_agent,created_at) VALUES(?,?,?,?,?,?,'QR',?,?,?)")
      .run(randomUUID(),fresh.qr_id,fresh.vehicle_id,oldKm,value,diff,clientIp(req),String(req.headers.get("user-agent")||"").slice(0,500)||null,now);
    db.prepare("UPDATE vehicle_qr_codes SET last_used_at=?,updated_at=? WHERE id=?").run(now,now,fresh.qr_id);
    db.prepare("INSERT INTO audit_logs(id,created_at,user_id,user_name_snapshot,module,action,entity_type,entity_id,entity_reference,old_values,new_values,description,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(randomUUID(),now,null,"QR / Saha Kullanıcısı","Araç QR","KM Güncellendi","vehicle",fresh.vehicle_id,fresh.plate,JSON.stringify({current_odometer:oldKm}),JSON.stringify({current_odometer:value}),`QR üzerinden Güncel KM ${fmt(oldKm)} KM → ${fmt(value)} KM olarak güncellendi. Kaynak: QR`,randomUUID());
    db.exec("COMMIT");
    return json({ok:true,message:"Kilometre başarıyla güncellendi.",plate:fresh.plate,previousOdometer:oldKm,currentOdometer:value,difference:diff});
  }catch(e:any){
    try{db.exec("ROLLBACK")}catch{}
    if(String(e?.message||"").includes("KM_BELOW_CURRENT"))return json({ok:false,message:"Girilen kilometre aracın mevcut kilometresinden düşük olamaz. Lütfen sayfayı yenileyip tekrar deneyin."},409);
    if(String(e?.message||"").includes("QR_NOT_ACTIVE"))return json({ok:false,message:"Bu QR kodu artık aktif değil."},404);
    logApplicationError("public_vehicle_qr_km",e,null);
    return json({ok:false,message:"İşlem sırasında bir sorun oluştu. Lütfen tekrar deneyin."},500);
  }
}
