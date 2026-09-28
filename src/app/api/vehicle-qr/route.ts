import {NextRequest,NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/local/auth";
import {getDatabase} from "@/lib/local/database";
import {auditAction} from "@/lib/audit";
import {bulkCreateMissingVehicleQrs,ensureVehicleQr,rotateVehicleQr,setVehicleQrActive} from "@/lib/vehicle-qr";
import {sameOrigin,safeRedirectPath} from "@/lib/security";
import {localRedirectUrl} from "@/lib/local/redirect-url";
import {logApplicationError} from "@/lib/errors";

export const runtime="nodejs";
export const dynamic="force-dynamic";

function red(req:NextRequest,path:string){return NextResponse.redirect(localRedirectUrl(req,path),303)}
function msg(v:string){return encodeURIComponent(v.slice(0,180))}

export async function POST(req:NextRequest){
  const user=await getCurrentUser();
  if(!user)return red(req,"/login");
  if(!sameOrigin(req))return new NextResponse("Geçersiz istek",{status:403});
  let fd:FormData;
  try{fd=await req.formData()}catch{return red(req,"/arac-qr-km-guncelleme?error=form")}
  const op=String(fd.get("operation")||"");
  const vehicleId=String(fd.get("vehicle_id")||"");
  const back=safeRedirectPath(fd.get("return_to"),"/arac-qr-km-guncelleme");
  const db=getDatabase();
  try{
    if(op==="create"){
      const before=db.prepare("SELECT * FROM vehicle_qr_codes WHERE vehicle_id=?").get(vehicleId) as any;
      const qr=ensureVehicleQr(db,vehicleId,user.id);
      const vehicle=db.prepare("SELECT plate FROM vehicles WHERE id=?").get(vehicleId) as any;
      if(!before)auditAction(user,"QR Oluşturuldu","vehicle",vehicleId,vehicle?.plate||vehicleId,null,{qr_active:true},"Araç için benzersiz KM QR kodu oluşturuldu.");
      return red(req,`/arac-qr-km-guncelleme/${vehicleId}?saved=1`);
    }
    if(op==="bulk_create"){
      const count=bulkCreateMissingVehicleQrs(db,user.id);
      auditAction(user,"Toplu QR Oluşturuldu","vehicle_qr","bulk","Araç QR",null,{created_count:count},`${count} araç için eksik QR kodu oluşturuldu.`);
      return red(req,`/arac-qr-km-guncelleme?saved=${msg(`${count} araç için QR oluşturuldu.`)}`);
    }
    if(op==="rotate"){
      const vehicle=db.prepare("SELECT plate FROM vehicles WHERE id=?").get(vehicleId) as any;
      rotateVehicleQr(db,vehicleId,user.id);
      auditAction(user,"QR Yenilendi","vehicle",vehicleId,vehicle?.plate||vehicleId,null,{qr_rotated:true},"Eski QR bağlantısı geçersiz hale getirildi ve yeni token üretildi.");
      return red(req,`${back}${back.includes("?")?"&":"?"}saved=1`);
    }
    if(op==="disable"||op==="enable"){
      const active=op==="enable";
      const vehicle=db.prepare("SELECT plate FROM vehicles WHERE id=?").get(vehicleId) as any;
      setVehicleQrActive(db,vehicleId,active);
      auditAction(user,active?"QR Etkinleştirildi":"QR Devre Dışı Bırakıldı","vehicle",vehicleId,vehicle?.plate||vehicleId,null,{qr_active:active},active?"Araç QR kodu yeniden etkinleştirildi.":"Araç QR kodu devre dışı bırakıldı.");
      return red(req,`${back}${back.includes("?")?"&":"?"}saved=1`);
    }
    return red(req,`${back}${back.includes("?")?"&":"?"}error=${msg("Bilinmeyen QR işlemi.")}`);
  }catch(e:any){
    logApplicationError(`vehicle_qr:${op}`,e,user.id);
    return red(req,`${back}${back.includes("?")?"&":"?"}error=${msg(String(e?.message||"İşlem sırasında bir sorun oluştu."))}`);
  }
}
