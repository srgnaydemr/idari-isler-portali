import {randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';

export const personnelColumns=['Ad','Soyad','Telefon','Şirket','Şube','Birim','İstenen Belgeler'];
export const complianceColumns=['Araç Plakası','Kasko Bitiş Tarihi','Muayene Bitiş Tarihi','Otopark Bitiş Tarihi','Sigorta Bitiş Tarihi'];
export const docTypes=['CASCO','INSPECTION','PARKING','TRAFFIC_INSURANCE'];
const fields=['first_name','last_name','phone','company','branch','department','requested_documents'];
const text=(v:any)=>String(v??'').trim();
const norm=(v:any)=>text(v).toLocaleLowerCase('tr-TR').replace(/\s+/g,' ');
export const plateKey=(v:any)=>text(v).toUpperCase().replace(/\s+/g,'');
const phoneKey=(v:any)=>text(v).replace(/\D/g,'').replace(/^90/,'').replace(/^0/,'');
export type InputRow={row:number;values:any[];id?:string};
export type PlanRow={row:number;label:string;status:'new'|'update'|'unchanged'|'error'|'missing';message?:string;id?:string;changes:Record<string,{old:any;value:any;documentId?:string}>};
export function excelDate(v:any):string{
 let s='';
 if(v instanceof Date){if(!Number.isFinite(v.getTime()))throw new Error('Geçersiz tarih');s=v.toISOString().slice(0,10)}
 else if(typeof v==='number'){if(v<1||v>2958465)throw new Error('Geçersiz Excel tarihi');s=new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000).toISOString().slice(0,10)}
 else{s=text(v);const m=s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);if(m)s=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;}
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw new Error('Tarih GG.AA.YYYY veya YYYY-AA-GG olmalı');
 return s;
}
export function planImport(db:DatabaseSync,kind:string,inputs:InputRow[]):PlanRow[]{
 const people=kind==='personnel'?db.prepare("SELECT * FROM personnel WHERE status<>'DELETED'").all() as any[]:[];
 const vehicles=kind==='compliance'?db.prepare('SELECT * FROM vehicles').all() as any[]:[];
 const plans:PlanRow[]=inputs.map(input=>{
  const values=input.values.map(text),label=kind==='personnel'?`${values[0]} ${values[1]}`:values[0];
  const row:PlanRow={row:input.row,label,status:'unchanged',changes:{}};
  try{
   if(values.some(v=>v==='[Formül desteklenmiyor]'))throw new Error('Formül yerine hücre değerlerini yapıştırın.');
   if(kind==='personnel'){
    let matches:any[]=[];
    if(input.id){matches=people.filter(p=>p.id===input.id);if(!matches.length)throw new Error('Sistem kayıt kimliği bulunamadı; otomatik yeni personel oluşturulmadı.');}
    else if(!values[0]||!values[1])throw new Error('Ad ve Soyad zorunludur.');
    const p=matches[0];row.id=p?.id;
    const missing=[0,1,3,4,5].filter(i=>!values[i]&&!p?.[fields[i]]).map(i=>personnelColumns[i]);
    if(missing.length)throw new Error(`Zorunlu alan eksik: ${missing.join(', ')}`);
    fields.forEach((f,i)=>{if(values[i]&&values[i]!==text(p?.[f]))row.changes[f]={old:p?.[f]??null,value:values[i]}});
    row.status=p?(Object.keys(row.changes).length?'update':'unchanged'):'new';
   }else{
    if(!values[0])throw new Error('Araç Plakası zorunludur.');
    const matches=vehicles.filter(v=>plateKey(v.plate)===plateKey(values[0]));
    if(!matches.length){row.status='missing';row.message='Araç bulunamadı; yeni araç oluşturulmayacak.';return row}
    if(matches.length!==1)throw new Error('Birden fazla araç eşleşti; manuel kontrol gerekli.');
    row.id=matches[0].id;
    docTypes.forEach((type,i)=>{
     if(!values[i+1])return;
     const value=excelDate(input.values[i+1]);
     const docs=db.prepare('SELECT * FROM vehicle_compliance_documents WHERE vehicle_id=? AND document_type=? ORDER BY (id IN (SELECT document_id FROM compliance_current)) DESC,end_date DESC,created_at DESC,id DESC').all(row.id!,type) as any[];
     const old=docs[0];
     if(value!==old?.end_date)row.changes[type]={old:old?.end_date??null,value,documentId:old?.id};
    });
    row.status=Object.keys(row.changes).length?'update':'unchanged';
   }
  }catch(e){row.status='error';row.message=(e as Error).message;row.changes={}}
  return row;
 });
 const keys=plans.map((p,i)=>p.id|| (kind==='compliance'?plateKey(inputs[i].values[0]):`new:${i}`));
 plans.forEach((p,i)=>{if(keys[i]&&keys.filter(x=>x===keys[i]).length>1){p.status='error';p.message='Dosyada aynı kayıt birden fazla satırda bulunuyor; tekrarları kaldırın.';p.changes={}}});
 return plans;
}
export function applyImport(db:DatabaseSync,kind:string,inputs:InputRow[],preview:PlanRow[],userId:string){
 const result={total:preview.length,new:0,updated:0,unchanged:0,missing:0,errors:[] as string[]};
 db.exec('SAVEPOINT safe_import');
 try{
 // Lock stable IDs before revalidating the preview; concurrent writers cannot slip between compare and update.
 for(const id of [...new Set(preview.map(p=>p.id).filter(Boolean))].sort()){
  db.prepare('SELECT id FROM '+(kind==='personnel'?'personnel':'vehicles')+' WHERE id=? FOR UPDATE').get(id!);
  if(kind==='compliance')db.prepare('SELECT id FROM vehicle_compliance_documents WHERE vehicle_id=? FOR UPDATE').all(id!);
 }
 const fresh=planImport(db,kind,inputs),now=new Date().toISOString();
 preview.forEach((p,i)=>{
  if(p.status==='error'||p.status==='missing'){if(p.status==='missing')result.missing++;result.errors.push(`Satır ${p.row}: ${p.message}`);return}
  if(JSON.stringify(p)!==JSON.stringify(fresh[i])){result.errors.push(`Satır ${p.row}: Önizlemeden sonra kayıt değişti. Yeniden önizleyin.`);return}
  if(p.status==='unchanged'){result.unchanged++;return}
  const id=p.id||randomUUID();
  if(kind==='personnel'){
   const keys=Object.keys(p.changes).filter(k=>fields.includes(k));
   if(p.status==='new')db.prepare(`INSERT INTO personnel(id,${keys.join(',')},status,created_by,created_at,updated_at) VALUES(?,${keys.map(()=>'?').join(',')},'ACTIVE',?,?,?)`).run(id,...keys.map(k=>p.changes[k].value),userId,now,now);
   else db.prepare(`UPDATE personnel SET ${keys.map(k=>k+'=?').join(',')},updated_at=? WHERE id=?`).run(...keys.map(k=>p.changes[k].value),now,id);
  }else for(const [type,change] of Object.entries(p.changes)){
   if(change.documentId)db.prepare('UPDATE vehicle_compliance_documents SET end_date=? WHERE id=? AND vehicle_id=? AND document_type=?').run(change.value,change.documentId,id,type);
   else db.prepare('INSERT INTO vehicle_compliance_documents(id,vehicle_id,document_type,end_date,created_by,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),id,type,change.value,userId,now);
   db.prepare('INSERT INTO compliance_change_history VALUES(?,?,?,?,?,?,?)').run(randomUUID(),id,type,change.old,change.value,userId,now);
  }
  db.prepare('INSERT INTO audit_logs(id,created_at,user_id,module,action,entity_type,entity_id,entity_reference,old_values,new_values,description) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),now,userId,kind==='personnel'?'Personel':'Süre Takibi','Excel alan bazlı güncelleme',kind,id,p.label,JSON.stringify(Object.fromEntries(Object.entries(p.changes).map(([k,v])=>[k,v.old]))),JSON.stringify(Object.fromEntries(Object.entries(p.changes).map(([k,v])=>[k,v.value]))),'Mevcut kayıt ve ilişkiler korundu.');
  if(p.status==='new')result.new++;else result.updated++;
 });
 db.exec('RELEASE safe_import');return result;
 }catch(e){db.exec('ROLLBACK TO safe_import; RELEASE safe_import');throw e}
}
