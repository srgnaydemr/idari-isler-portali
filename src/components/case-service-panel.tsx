import { getDatabase } from '@/lib/local/database';
import { requireUser } from '@/lib/auth';
import { saveCaseService } from '@/lib/case-service';
import { formatDateTime,formatNumber } from '@/lib/format';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { SubmitButton } from './submit-button';

export function CaseServicePanel({kind,sourceId,vehicleId}:{kind:'ACCIDENT'|'DAMAGE';sourceId:string;vehicleId:string}) {
  const db=getDatabase();
  const rows=db.prepare('SELECT * FROM case_services WHERE source_type=? AND source_id=? ORDER BY created_at DESC,id DESC').all(kind,sourceId) as any[];
  const open=rows.find(x=>!x.exit_at);
  const record=db.prepare(`SELECT status FROM ${kind==='ACCIDENT'?'vehicle_accidents':'vehicle_damages'} WHERE id=?`).get(sourceId) as any;
  const closed=['COMPLETED','CLOSED'].includes(record?.status);
  const vehicle=db.prepare('SELECT current_odometer FROM vehicles WHERE id=?').get(vehicleId) as any;
  const path=kind==='ACCIDENT'?`/kaza-hasar/${sourceId}`:`/kaza-hasar/hasar/${sourceId}`;
  async function save(fd:FormData) {
    'use server';
    const {user}=await requireUser();
    try {saveCaseService(kind,sourceId,user.id,fd);} catch(e:any) {redirect(`${path}?error=${encodeURIComponent(e.message)}`);}
    for(const p of [path,'/kaza-hasar','/araclar',`/araclar/${vehicleId}`,'/ana-panel','/servis-ikame','/raporlar']) revalidatePath(p);
    redirect(`${path}?saved=1`);
  }
  return <section className="card section"><div className="section-head"><div><h2 className="section-title">Servis Süreci</h2><div className="page-sub">Güncel KM: {formatNumber(vehicle.current_odometer)} • Tarihler Türkiye saatidir.</div></div></div><div className="section-body">{!closed&&<form action={save}><input type="hidden" name="operation" value={open?'exit':'entry'}/><input type="hidden" name="service_id" value={open?.id||''}/><div className="form-grid">{!open&&<div className="field"><label>Servis adı *</label><input name="service_name" className="input" required/></div>}<div className="field"><label>{open?'Çıkış':'Giriş'} tarihi / saati *</label><input name="at" type="datetime-local" className="input" required/></div><div className="field"><label>{open?'Çıkış':'Servise giriş'} KM *</label><input name="km" type="number" min={Math.max(vehicle.current_odometer,open?.entry_km||0)} step="1" className="input" required/></div><div className="field"><label>Açıklama / not</label><textarea name="note" className="textarea"/></div></div><div className="form-actions"><SubmitButton>{open?'Servisten Çıkış Yap':'Servise Giriş Yap'}</SubmitButton></div></form>}<h3>Servis Geçmişi</h3>{rows.map(r=><article className="service-history" key={r.id}><strong>{r.service_name}</strong><span className={`pill ${r.exit_at?'green':'orange'}`}>{r.exit_at?'Tamamlandı':'Serviste'}</span><p>Servise Giriş: {formatDateTime(r.entry_at)} • {formatNumber(r.entry_km)} KM</p><p>Servisten Çıkış: {formatDateTime(r.exit_at)} • {r.exit_km==null?'—':formatNumber(r.exit_km)+' KM'}</p><p>{r.entry_note}</p><p>{r.exit_note}</p></article>)}{!rows.length&&<p className="page-sub">Henüz servis hareketi yok.</p>}</div></section>;
}
