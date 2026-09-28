import {randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
export function manageEquipmentType(db:DatabaseSync,op:string,id:string,name:string){
 db.exec('SAVEPOINT equipment_type_change');
 try{
  const now=new Date().toISOString();name=name.trim();
  if(op==='create'){
   if(!name||name.length>100)throw new Error('Tür adı 1–100 karakter olmalı.');
   if((db.prepare("SELECT name FROM system_definitions WHERE category='equipment_type'").all() as any[]).some(x=>x.name.toLocaleLowerCase('tr-TR')===name.toLocaleLowerCase('tr-TR')))throw new Error('Bu ekipman türü zaten var.');
   db.prepare("INSERT INTO system_definitions(id,category,code,name,is_active,sort_order,is_system,created_at,updated_at) VALUES(?,'equipment_type',?,?,1,100,0,?,?)").run(randomUUID(),'CUSTOM_'+randomUUID(),name,now,now);
  }else{
   const row=db.prepare("SELECT * FROM system_definitions WHERE id=? AND category='equipment_type'").get(id) as any;if(!row)throw new Error('Ekipman türü bulunamadı.');
   const count=Number((db.prepare('SELECT count(*) c FROM equipment WHERE equipment_type=? COLLATE NOCASE').get(row.name) as any).c);
   if(op==='rename'){
    if(!name||name.length>100)throw new Error('Tür adı 1–100 karakter olmalı.');
    if((db.prepare("SELECT id,name FROM system_definitions WHERE category='equipment_type' AND id<>?").all(id) as any[]).some(x=>x.name.toLocaleLowerCase('tr-TR')===name.toLocaleLowerCase('tr-TR')))throw new Error('Bu ekipman türü zaten var.');
    db.prepare('UPDATE equipment SET equipment_type=? WHERE equipment_type=? COLLATE NOCASE').run(name,row.name);
    db.prepare('UPDATE system_definitions SET name=?,updated_at=? WHERE id=?').run(name,now,id);
   }else if(op==='deactivate'||op==='activate')db.prepare('UPDATE system_definitions SET is_active=?,updated_at=? WHERE id=?').run(op==='activate'?1:0,now,id);
   else if(op==='delete'){
    if(count)throw new Error(`Bu ekipman türü ${count} kayıt tarafından kullanılıyor. Silmek yerine pasif hale getirin.`);
    // Preserve the definition as a tombstone so startup seeds cannot recreate it.
    db.prepare('UPDATE system_definitions SET is_active=0,updated_at=? WHERE id=?').run(now,id);
   }else throw new Error('Bilinmeyen işlem.');
  }
  db.exec('RELEASE equipment_type_change');
 }catch(e){db.exec('ROLLBACK TO equipment_type_change; RELEASE equipment_type_change');throw e}
}
