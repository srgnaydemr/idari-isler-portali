import {NextRequest,NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {getCurrentUser} from "@/lib/local/auth";
import {getDatabase} from "@/lib/local/database";
import {localRedirectUrl} from "@/lib/local/redirect-url";
import {sameOrigin,safeRedirectPath} from "@/lib/security";
import {auditAction} from "@/lib/audit";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const trim=(v:any)=>String(v??"").trim();
const nil=(v:any)=>trim(v)||null;
const redir=(req:NextRequest,path:string,key?:string,value?:string)=>{const u=localRedirectUrl(req,path);if(key&&value)u.searchParams.set(key,value);return NextResponse.redirect(u,303)};

export async function POST(req:NextRequest){
  const user=await getCurrentUser();
  if(!user)return redir(req,"/login");
  if(!sameOrigin(req))return new NextResponse("Geçersiz istek",{status:403});
  const fd=await req.formData();
  const op=trim(fd.get("operation"));
  const back=safeRedirectPath(fd.get("return_to"),"/personel-yonetimi");
  const db=getDatabase();
  const now=new Date().toISOString();
  try{
    if(op==="create"){
      const first=trim(fd.get("first_name")),last=trim(fd.get("last_name")),department=trim(fd.get("department")),company=trim(fd.get("company")),branch=trim(fd.get("branch")),documents=nil(fd.get("requested_documents"));
      if(!first||!last||!department||!company||!branch)return redir(req,back,"error","Ad, soyad, şirket, şube ve birim zorunludur.");
      const id=randomUUID();
      db.prepare("INSERT INTO personnel(id,first_name,last_name,company,department,branch,phone,requested_documents,status,deleted_at,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'ACTIVE',NULL,?,?,?)")
        .run(id,first,last,company,department,branch,nil(fd.get("phone")),documents,user.id,now,now);
      auditAction(user,"Personel Eklendi","personnel",id,`${first} ${last}`,null,{first_name:first,last_name:last,status:"ACTIVE"});
      return redir(req,`/personel-yonetimi/${id}`,"saved","1");
    }
    const id=trim(fd.get("personnel_id"));
    const row=db.prepare("SELECT * FROM personnel WHERE id=?").get(id) as any;
    if(!row||row.status==="DELETED")return redir(req,back,"error","Personel bulunamadı.");
    if(op==="update"){
      const first=trim(fd.get("first_name")),last=trim(fd.get("last_name")),department=trim(fd.get("department")),company=trim(fd.get("company")),branch=trim(fd.get("branch")),documents=nil(fd.get("requested_documents"));
      if(!first||!last||!department||!company||!branch)return redir(req,back,"error","Ad, soyad, şirket, şube ve birim zorunludur.");
      db.prepare("UPDATE personnel SET first_name=?,last_name=?,company=?,department=?,branch=?,phone=?,requested_documents=?,updated_at=? WHERE id=?")
        .run(first,last,company,department,branch,nil(fd.get("phone")),documents,now,id);
      auditAction(user,"Personel Güncellendi","personnel",id,`${first} ${last}`,row,{...row,first_name:first,last_name:last,department,company,branch,requested_documents:documents,phone:nil(fd.get("phone"))});
      return redir(req,back,"saved","1");
    }
    if(op==="deactivate"){
      const activeAsset=!!db.prepare("SELECT 1 FROM personnel_assignments WHERE personnel_id=? AND return_date IS NULL AND status='ACTIVE' LIMIT 1").get(id);
      if(db.prepare("SELECT 1 FROM vehicle_assignments WHERE personnel_id=? AND return_date IS NULL").get(id))return redir(req,back,"error","Personelin aktif araç zimmeti var. Önce iade alın.");
      if(activeAsset)return redir(req,back,"error","Personelin aktif ekipman zimmeti bulunuyor. Önce zimmeti iade alın.");
      const activeVehicle=!!db.prepare("SELECT 1 FROM vehicle_usage_records WHERE personnel_id=? AND return_at IS NULL AND status='IN_USE' LIMIT 1").get(id);
      if(activeVehicle)return redir(req,back,"error","Personelin aktif araç kullanımı bulunuyor. Önce aracı iade alın.");
      db.prepare("UPDATE personnel SET status='DELETED',deleted_at=?,updated_at=? WHERE id=?").run(now,now,id);
      auditAction(user,"Personel Kaldırıldı","personnel",id,`${row.first_name} ${row.last_name}`,row,{...row,status:"DELETED",deleted_at:now});
      return redir(req,back,"saved","removed");
    }
    return redir(req,back,"error","Bilinmeyen işlem.");
  }catch(e:any){
    console.error("PERSONNEL_MANAGEMENT_ERROR",op,e);
    const m=String(e?.message||"");
    if(m.includes("UNIQUE constraint failed: personnel.employee_no"))return redir(req,back,"error","Bu personel numarası zaten kayıtlı.");
    return redir(req,back,"error","İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin.");
  }
}
