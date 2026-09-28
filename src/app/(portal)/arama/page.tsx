import Link from "next/link";
import {requireUser} from "@/lib/auth";
import {formatDateTime} from "@/lib/format";
import {getDatabase} from "@/lib/local/database";
export const dynamic="force-dynamic";

function replacementDesc(x:any){
  const start=x.replacement_received_at?formatDateTime(x.replacement_received_at):"Tarih yok",end=x.replacement_returned_at?formatDateTime(x.replacement_returned_at):"Henüz iade edilmedi";
  const detail=x.source_type==="SERVICE"?[x.service_name,x.service_reason].filter(Boolean).join(" • "):x.source_type==="ACCIDENT"?[x.file_number,"Kaza dosyası"].filter(Boolean).join(" • "):[x.damage_type,x.damage_description].filter(Boolean).join(" • ");
  return `Asıl araç: ${x.main_plate||"—"} • ${start} → ${end}${detail?` • ${detail}`:""}`;
}
export default async function SearchPage({searchParams}:{searchParams:Promise<{q?:string}>}){
  const{q=""}=await searchParams,term=q.trim();const{db}=await requireUser();let results:any[]=[];
  if(db&&term.length>=2){
    const like=`%${term}%`,sql=getDatabase();
    const[v,a]=await Promise.all([
      db.from("vehicles").select("id,plate,brand,model").eq("is_replacement",0).or(`plate.ilike.${like},brand.ilike.${like},model.ilike.${like},fleet_company.ilike.${like},vin.ilike.${like}`).limit(20),
      db.from("vehicle_accidents").select("id,file_number,accident_date,vehicles(plate)").ilike("file_number",like).limit(20),
    ]);
    for(const x of v.data??[])results.push({type:"Araç",title:x.plate,desc:`${x.brand} ${x.model}`,href:`/araclar/${x.id}`});
    const rr=sql.prepare(`SELECT rr.*,v.plate main_plate,s.service_name,s.service_reason,a.file_number,d.damage_type,d.description damage_description
      FROM vehicle_replacement_records rr JOIN vehicles v ON v.id=rr.vehicle_id
      LEFT JOIN vehicle_service_records s ON rr.source_type='SERVICE' AND s.id=rr.source_id
      LEFT JOIN vehicle_accidents a ON rr.source_type='ACCIDENT' AND a.id=rr.source_id
      LEFT JOIN vehicle_damages d ON rr.source_type='DAMAGE' AND d.id=rr.source_id
      WHERE rr.replacement_plate LIKE ? COLLATE NOCASE ORDER BY rr.created_at DESC LIMIT 50`).all(like) as any[];
    for(const x of rr){const href=x.source_type==="ACCIDENT"?`/kaza-hasar/${x.source_id}`:x.source_type==="DAMAGE"?`/kaza-hasar/hasar/${x.source_id}`:`/araclar/${x.vehicle_id}/servis-ikame`;results.push({type:"İkame Araç",title:x.replacement_plate,desc:replacementDesc(x),href:null})}
    for(const x of a.data??[])results.push({type:"Kaza",title:x.file_number,desc:x.vehicles?.plate||"",href:`/kaza-hasar/${x.id}`});
    const ps=sql.prepare(`SELECT id,first_name,last_name,department,company,branch,phone FROM personnel WHERE status<>'DELETED' AND (first_name||' '||last_name LIKE ? COLLATE NOCASE OR COALESCE(employee_no,'') LIKE ? COLLATE NOCASE OR COALESCE(department,'') LIKE ? COLLATE NOCASE OR COALESCE(phone,'') LIKE ? COLLATE NOCASE  ) LIMIT 20`).all(like,like,like,like) as any[];
    for(const x of ps)results.push({type:"Personel",title:`${x.first_name} ${x.last_name}`,desc:[x.company,x.branch,x.department,x.phone].filter(Boolean).join(" • "),href:`/personel-zimmetleri/personel/${x.id}`});
    const es=sql.prepare(`SELECT e.*,p.first_name||' '||p.last_name person_name FROM equipment e LEFT JOIN personnel_assignments pa ON pa.equipment_id=e.id AND pa.return_date IS NULL AND pa.status='ACTIVE' LEFT JOIN personnel p ON p.id=pa.personnel_id WHERE COALESCE(e.serial_number,'') LIKE ? COLLATE NOCASE OR COALESCE(e.imei,'') LIKE ? COLLATE NOCASE OR COALESCE(e.imei2,'') LIKE ? COLLATE NOCASE OR COALESCE(e.asset_tag,'') LIKE ? COLLATE NOCASE OR COALESCE(e.brand,'') LIKE ? COLLATE NOCASE OR COALESCE(e.model,'') LIKE ? COLLATE NOCASE LIMIT 20`).all(like,like,like,like,like,like) as any[];
    for(const x of es)results.push({type:"Ekipman",title:[x.equipment_type,x.brand,x.model].filter(Boolean).join(" "),desc:[x.serial_number&&`Seri: ${x.serial_number}`,x.imei&&`IMEI: ${x.imei}`,x.imei2&&`IMEI2: ${x.imei2}`,x.asset_tag&&`Demirbaş: ${x.asset_tag}`,x.person_name&&`Personel: ${x.person_name}`].filter(Boolean).join(" • "),href:`/personel-zimmetleri/demirbas/${x.id}`});
  }
  return <><div className="page-head"><div><h1 className="page-title">Global Arama</h1><div className="page-sub">Araç, geçmiş ikame plaka, kaza, personel, ekipman ve seri numarası araması</div></div></div>{term.length<2?<div className="card empty"><strong>Arama bekleniyor</strong>En az 2 karakter girin.</div>:<section className="card"><div className="section-body"><div className="alerts">{results.map((r,i)=>r.href?<Link href={r.href} className="alert-row" key={`${r.type}-${i}-${r.title}`}><div><span className="pill blue">{r.type}</span><strong style={{display:"block",marginTop:7}}>{r.title}</strong><div className="page-sub">{r.desc}</div></div><span>→</span></Link>:<div className="alert-row" key={i}><div><span className="pill blue">{r.type}</span><strong style={{display:"block",marginTop:7}}>{r.title}</strong><div className="page-sub">{r.desc}</div><Link href={`/araclar?tur=ikame&ara=${encodeURIComponent(r.title)}`} className="btn btn-secondary">İkame kaydını görüntüle</Link></div></div>)}{!results.length?<div className="empty"><strong>Eşleşen kayıt yok</strong>Farklı bir plaka, kişi, seri no veya anahtar kelime deneyin.</div>:null}</div></div></section>}</>;
}
