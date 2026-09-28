import {randomUUID} from "node:crypto";
import Link from "next/link";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {requireUser} from "@/lib/auth";
import {getDatabase} from "@/lib/local/database";
import {formatDate,formatNumber} from "@/lib/format";
import {SubmitButton} from "@/components/submit-button";
import {tireTransactionLabel,tireTypeLabel,uiLabel} from "@/lib/labels";
import {TireVehicleFields} from "@/components/tire-vehicle-fields";
import {auditAction} from "@/lib/audit";
import {updateCentralVehicleOdometer} from "@/lib/local/vehicle-state";

export const dynamic="force-dynamic";
const text=(v:unknown)=>String(v??"").trim();
function trToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
function trTime(){const parts=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Istanbul",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date());const o=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${o.hour}:${o.minute}`}

export default async function Tires({searchParams}:{searchParams:Promise<{q?:string;vehicle?:string;type?:string;start?:string;end?:string;saved?:string;error?:string}>}){
  const {user}=await requireUser();
  const sp=await searchParams,db=getDatabase(),today=trToday();
  const vehicles=db.prepare("SELECT id,plate,brand,model,tire_storage_dealer,current_odometer FROM vehicles WHERE is_active=1 ORDER BY plate").all() as any[];
  const q=text(sp.q),vehicle=text(sp.vehicle),type=text(sp.type),start=text(sp.start),end=text(sp.end);
  const where:string[]=["1=1"],args:any[]=[];
  if(q){where.push("(v.plate LIKE ? COLLATE NOCASE OR COALESCE(t.brand,'') LIKE ? COLLATE NOCASE OR COALESCE(t.model,'') LIKE ? COLLATE NOCASE OR COALESCE(t.storage_dealer,'') LIKE ? COLLATE NOCASE OR COALESCE(t.description,'') LIKE ? COLLATE NOCASE OR COALESCE(t.performed_by_name,'') LIKE ? COLLATE NOCASE)");for(let i=0;i<6;i++)args.push(`%${q}%`)}
  if(vehicle){where.push("t.vehicle_id=?");args.push(vehicle)}
  if(type){where.push("t.tire_type=?");args.push(type)}
  if(start){where.push("substr(t.transaction_date,1,10)>=?");args.push(start)}
  if(end){where.push("substr(t.transaction_date,1,10)<=?");args.push(end)}
  const rows=db.prepare(`SELECT t.*,v.plate FROM vehicle_tire_transactions t JOIN vehicles v ON v.id=t.vehicle_id WHERE ${where.join(" AND ")} ORDER BY t.transaction_date DESC,COALESCE(t.transaction_time,'') DESC,t.created_at DESC LIMIT 500`).all(...args) as any[];

  async function add(fd:FormData){"use server";const {user}=await requireUser();const db=getDatabase(),vehicleId=text(fd.get("vehicle_id")),date=text(fd.get("transaction_date")),time=text(fd.get("transaction_time")),km=Number(fd.get("odometer"));
    let error="";
    try{
      const v=db.prepare("SELECT * FROM vehicles WHERE id=? AND is_active=1").get(vehicleId) as any;if(!v)throw new Error("Araç bulunamadı.");
      if(!date||date>trToday())throw new Error("İşlem tarihi bugünden ileri olamaz.");
      if(!Number.isSafeInteger(km)||km<Number(v.current_odometer||0))throw new Error(`Girilen kilometre aracın mevcut güncel kilometresinden düşük olamaz. Güncel KM: ${Number(v.current_odometer||0).toLocaleString("tr-TR")}`);
      const transactionType=text(fd.get("transaction_type"));if(!transactionType)throw new Error("İşlem tipi zorunludur.");
      const performedBy=text(fd.get("performed_by_name"));if(!performedBy)throw new Error("İşlemi yapan kişi Ad Soyad bilgisi zorunludur.");
      const id=randomUUID(),createdAt=new Date().toISOString();
      db.exec("BEGIN IMMEDIATE");
      try{
        updateCentralVehicleOdometer(db,vehicleId,km,user.id,"Lastik işlemi kilometresi");
        db.prepare(`INSERT INTO vehicle_tire_transactions(id,vehicle_id,transaction_date,transaction_time,odometer,tire_type,brand,model,size,quantity,transaction_type,tire_dealer,storage_dealer,description,performed_by_name,cost,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(id,vehicleId,date,time||null,km,text(fd.get("tire_type"))||null,text(fd.get("brand"))||null,text(fd.get("model"))||null,text(fd.get("size"))||null,Math.max(1,Number(fd.get("quantity")||1)),transactionType,text(fd.get("tire_dealer"))||null,text(fd.get("storage_dealer"))||v.tire_storage_dealer||null,text(fd.get("description"))||null,performedBy,Math.max(0,Number(fd.get("cost")||0)),user.id,createdAt);
        db.exec("COMMIT");
      }catch(e){try{db.exec("ROLLBACK")}catch{}throw e}
      auditAction(user,"Lastik İşlemi Oluşturuldu","vehicle_tire_transaction",id,v.plate,null,{vehicle_id:vehicleId,transaction_date:date,transaction_time:time||null,odometer:km,transaction_type:transactionType,performed_by_name:performedBy});
    }catch(e:any){error=String(e?.message||"Lastik işlemi kaydedilemedi.")}
    if(error)redirect(`/lastik-yonetimi?error=${encodeURIComponent(error)}`);revalidatePath("/lastik-yonetimi");revalidatePath(`/araclar/${vehicleId}`);redirect("/lastik-yonetimi?saved=1");
  }

  return <>
    <div className="page-head"><div><h1 className="page-title">Lastik Yönetimi</h1><div className="page-sub">Araç bazlı lastik işlemleri, kilometre kontrolü ve kalıcı hareket geçmişi.</div></div></div>
    {sp.saved?<div className="success-box">Lastik işlemi kaydedildi ve araç kilometresi güncellendi.</div>:null}{sp.error?<div className="error-box">{decodeURIComponent(sp.error)}</div>:null}
    <form action={add} className="card"><div className="section-head"><div className="section-title">Lastik İşlemi</div></div><div className="section-body"><div className="form-grid">
      <TireVehicleFields vehicles={vehicles.map(v=>({id:String(v.id),plate:String(v.plate),brand:v.brand?String(v.brand):null,model:v.model?String(v.model):null,tire_storage_dealer:v.tire_storage_dealer?String(v.tire_storage_dealer):null,current_odometer:Number(v.current_odometer||0)}))}/>
      <div className="field"><label>İşlem Tarihi *</label><input name="transaction_date" type="date" max={today} defaultValue={today} className="input" required/></div>
      <div className="field"><label>İşlem Saati</label><input name="transaction_time" type="time" defaultValue={trTime()} className="input"/></div>
      <div className="field"><label>Lastik Türü</label><select name="tire_type" className="select"><option value="SUMMER">Yazlık</option><option value="WINTER">Kışlık</option><option value="ALL_SEASON">Dört Mevsim</option></select></div>
      <div className="field"><label>Lastik Markası</label><input name="brand" className="input"/></div><div className="field"><label>Lastik Modeli</label><input name="model" className="input"/></div><div className="field"><label>Ölçü</label><input name="size" className="input" placeholder="225/55 R18"/></div><div className="field"><label>Adet</label><input name="quantity" type="number" min="1" className="input" defaultValue="4"/></div>
      <div className="field"><label>İşlem Tipi *</label><select name="transaction_type" className="select"><option value="INSTALLED">Takıldı</option><option value="REMOVED">Söküldü</option><option value="REPLACED">Değiştirildi</option><option value="SENT_TO_STORAGE">Depoya Gönderildi</option><option value="TAKEN_FROM_STORAGE">Depodan Alındı</option><option value="SCRAPPED">Hurdaya Ayrıldı</option></select></div>
      <div className="field"><label>İşlemi Yapan Kişi *</label><input name="performed_by_name" className="input" placeholder="Ad Soyad" autoComplete="off" required/></div>
      <div className="field"><label>Maliyet</label><input name="cost" type="number" min="0" step="0.01" className="input" placeholder="0,00"/></div><div className="field"><label>Lastik Bayisi</label><input name="tire_dealer" className="input"/></div><div className="field"><label>Depo Bayisi</label><input name="storage_dealer" className="input" placeholder="Boşsa araç kartındaki bayi kullanılır"/></div><div className="field" style={{gridColumn:"1/-1"}}><label>Açıklama</label><input name="description" className="input"/></div>
    </div><div className="form-actions"><SubmitButton>Lastik İşlemini Kaydet</SubmitButton></div></div></form>

    <form className="filters section" method="get"><input className="input filter-search" name="q" defaultValue={q} placeholder="Plaka, lastik, bayi, açıklama veya işlemi yapan kişi ara…"/><select className="select" name="vehicle" defaultValue={vehicle}><option value="">Tüm araçlar</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate}</option>)}</select><select className="select" name="type" defaultValue={type}><option value="">Tüm lastik türleri</option><option value="SUMMER">Yazlık</option><option value="WINTER">Kışlık</option><option value="ALL_SEASON">Dört Mevsim</option></select><input className="input" type="date" name="start" defaultValue={start}/><input className="input" type="date" name="end" defaultValue={end}/><button className="btn btn-primary">Filtrele</button><Link className="btn btn-secondary" href={`/api/tires/export?${new URLSearchParams({q,vehicle,type,start,end}).toString()}`}>Excel'e Aktar</Link>{q||vehicle||type||start||end?<Link className="btn btn-secondary" href="/lastik-yonetimi">Temizle</Link>:null}</form>

    <section className="card section table-wrap"><div className="section-head"><div><div className="section-title">Lastik Hareket Geçmişi</div><div className="page-sub">Aktif ve geçmiş tüm hareketler araç bazında aranabilir.</div></div></div><table className="table"><thead><tr><th>Tarih / Saat</th><th>Araç</th><th>İşlem KM</th><th>Lastik</th><th>Takılan</th><th>Sökülen</th><th>İşlem</th><th>Depo / Bayi</th><th>Maliyet</th><th>Açıklama</th><th>İşlemi Yapan</th></tr></thead><tbody>{rows.map(r=>{const qty=Number(r.quantity||0),installed=["INSTALLED","REPLACED"].includes(r.transaction_type)?qty:0,removed=["REMOVED","REPLACED"].includes(r.transaction_type)?qty:0;return <tr key={r.id}><td>{formatDate(r.transaction_date)}{r.transaction_time?<><br/><small>{r.transaction_time}</small></>:null}</td><td><Link className="link-primary" href={`/araclar/${r.vehicle_id}`}>{r.plate}</Link></td><td>{formatNumber(r.odometer)}</td><td>{[r.brand,r.model,r.size,uiLabel(r.tire_type,tireTypeLabel)].filter(Boolean).join(" • ")||"—"}</td><td>{installed||"—"}</td><td>{removed||"—"}</td><td>{uiLabel(r.transaction_type,tireTransactionLabel)}</td><td>{[r.storage_dealer,r.tire_dealer].filter(Boolean).join(" / ")||"—"}</td><td>{Number(r.cost||0).toLocaleString("tr-TR",{style:"currency",currency:"TRY"})}</td><td>{r.description||"—"}</td><td>{r.performed_by_name||"—"}</td></tr>})}</tbody></table>{!rows.length?<div className="empty">Seçili filtrelerde lastik hareketi bulunmuyor.</div>:null}</section>
  </>;
}
