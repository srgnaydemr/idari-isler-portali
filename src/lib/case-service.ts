import { randomUUID } from 'node:crypto';
import { getDatabase } from './local/database';
import { reconcileVehicleActiveStatus, updateCentralVehicleOdometer } from './local/vehicle-state';

export function localTimestamp(value: unknown) {
  const s=String(value||'');
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) throw new Error('Tarih ve saat zorunludur.');
  const d=new Date(s+':00+03:00');
  if(!Number.isFinite(d.getTime()) || d.getTime()>Date.now() || new Date(d.getTime()+3*3600000).toISOString().slice(0,16)!==s) throw new Error('Geçerli ve gelecekte olmayan bir tarih/saat girin.');
  return d.toISOString();
}
export function validKm(value:unknown,minimum:number) {
  if(value==null || String(value).trim()==='' || !Number.isSafeInteger(Number(value)) || Number(value)<0) throw new Error('Güncel KM zorunludur ve pozitif tam sayı olmalıdır.');
  if(Number(value)<minimum) throw new Error('Girilen kilometre aracın mevcut kilometresinden düşük olamaz.');
  return Number(value);
}
export function saveCaseService(kind:'ACCIDENT'|'DAMAGE',sourceId:string,userId:string,fd:FormData) {
  const db=getDatabase(),table=kind==='ACCIDENT'?'vehicle_accidents':'vehicle_damages';
  db.exec('BEGIN IMMEDIATE');
  try {
    const c=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(sourceId) as any;
    if(!c) throw new Error('Dosya bulunamadı.');
    const v=db.prepare('SELECT * FROM vehicles WHERE id=?').get(c.vehicle_id) as any;
    const open=db.prepare('SELECT * FROM case_services WHERE source_type=? AND source_id=? AND exit_at IS NULL').get(kind,sourceId) as any;
    const now=new Date().toISOString();
    const exiting=fd.get('operation')==='exit';
    const at=localTimestamp(fd.get('at'));
    const km=validKm(fd.get('km'),Math.max(Number(v.current_odometer),exiting?Number(open?.entry_km||0):0));
    const note=String(fd.get('note')||'').trim();
    if(exiting) {
      if(!open || String(fd.get('service_id'))!==open.id) throw new Error('Açık servis kaydı bulunamadı veya işlem daha önce tamamlandı.');
      if(at<open.entry_at) throw new Error('Çıkış tarihi giriş tarihinden önce olamaz.');
      const replacement=db.prepare("SELECT * FROM vehicle_replacement_records WHERE source_type=? AND source_id=? AND status='ACTIVE' LIMIT 1").get(kind,sourceId) as any;
      if(replacement) throw new Error(`Bu servis kaydına bağlı aktif ikame araç bulunmaktadır: ${replacement.replacement_plate}. Öncelikle ikame araç iade işlemini tamamlayınız.`);
      db.prepare('UPDATE case_services SET exit_at=?,exit_km=?,exit_note=?,completed_at=? WHERE id=?').run(at,km,note,now,open.id);
      db.prepare(`UPDATE ${table} SET status='COMPLETED',updated_at=? WHERE id=?`).run(now,sourceId);
    } else {
      if(open) throw new Error('Bu dosyanın açık servis kaydı zaten var.');
      if(['COMPLETED','CLOSED'].includes(c.status)) throw new Error('Kapalı dosya servise alınamaz.');
      if(db.prepare("SELECT 1 FROM vehicle_service_records WHERE vehicle_id=? AND status='OPEN'").get(v.id) || db.prepare('SELECT 1 FROM case_services WHERE vehicle_id=? AND exit_at IS NULL').get(v.id)) throw new Error('Araçta açık servis kaydı bulunmaktadır.');
      for(const t of ['vehicle_accidents','vehicle_damages']) if(db.prepare(`SELECT 1 FROM ${t} WHERE vehicle_id=? AND status='IN_SERVICE' AND NOT(id=? AND ?=?)`).get(v.id,sourceId,t,table)) throw new Error('Araç başka bir dosya kapsamında serviste.');
      const name=String(fd.get('service_name')||'').trim();
      if(!name) throw new Error('Servis adı zorunludur.');
      db.prepare('INSERT INTO case_services(id,vehicle_id,source_type,source_id,service_name,entry_at,entry_km,entry_note,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),v.id,kind,sourceId,name,at,km,note,now,userId);
      db.prepare(`UPDATE ${table} SET status='IN_SERVICE',updated_at=? WHERE id=?`).run(now,sourceId);
    }
    updateCentralVehicleOdometer(db,v.id,km,userId,exiting?'Hasar servis çıkış kilometresi':'Hasar servis giriş kilometresi');
    reconcileVehicleActiveStatus(db,v.id,userId,exiting?'Kaza / hasar servis süreci tamamlandı':'Kaza / hasar kapsamında servise alındı');
    db.exec('COMMIT'); return v.id as string;
  } catch(e) {db.exec('ROLLBACK');throw e;}
}
