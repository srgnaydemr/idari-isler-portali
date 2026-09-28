import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/local/database";
import { formatDateTime, formatNumber } from "@/lib/format";

export const dynamic="force-dynamic";

export default async function ServiceReplacementPage(){
  await requireUser();
  const db=getDatabase();
  const open=db.prepare(`SELECT s.*,v.plate FROM vehicle_service_records s JOIN vehicles v ON v.id=s.vehicle_id WHERE s.status='OPEN' ORDER BY s.service_in_at DESC`).all() as any[];
  const recent=db.prepare(`SELECT s.*,v.plate FROM vehicle_service_records s JOIN vehicles v ON v.id=s.vehicle_id WHERE s.status<>'OPEN' ORDER BY COALESCE(s.service_out_at,s.updated_at) DESC LIMIT 100`).all() as any[];
  const activeReplacements=db.prepare(`SELECT r.*,v.plate main_plate FROM vehicle_replacement_records r JOIN vehicles v ON v.id=r.vehicle_id WHERE r.status='ACTIVE' AND r.replacement_returned_at IS NULL ORDER BY r.replacement_received_at DESC`).all() as any[];
  const activeByService=new Map(activeReplacements.filter(r=>r.source_type==='SERVICE').map(r=>[String(r.source_id),r]));
  return <>
    <div className="page-head"><div><h1 className="page-title">Servis / İkame</h1><div className="page-sub">Açık servis süreçleri ve aktif ikame araçlar tek ekranda. İşlemler ilgili aracın Servis / İkame sekmesinden yönetilir.</div></div><div className="page-actions"><Link className="btn btn-primary" href="/araclar">Araç Seç / Servis Başlat</Link><Link className="btn btn-secondary" href="/araclar?tur=ikame">Aktif İkame Araçlar</Link></div></div>
    <section className="card section table-wrap"><div className="section-head"><div><div className="section-title">Açık Servisler</div><div className="page-sub">Aktif ikame varsa servis kapatılmadan önce ikame iadesi tamamlanmalıdır.</div></div><span className="pill blue">{open.length} açık kayıt</span></div><table className="table"><thead><tr><th>Araç</th><th>Servis</th><th>Giriş</th><th>Giriş KM</th><th>Aktif İkame</th><th>İşlem</th></tr></thead><tbody>{open.map(s=>{const r=activeByService.get(String(s.id));return <tr key={s.id}><td><strong>{s.plate}</strong></td><td>{s.service_name}<div className="page-sub">{s.service_reason}</div></td><td>{formatDateTime(s.service_in_at)}</td><td>{s.odometer==null?"—":`${formatNumber(s.odometer)} KM`}</td><td>{r?<><strong>{r.replacement_plate}</strong><div className="page-sub">{formatDateTime(r.replacement_received_at)}</div></>:<span className="pill gray">Yok</span>}</td><td><Link className="btn btn-secondary" href={`/araclar/${s.vehicle_id}/servis-ikame`}>Servis / İkameyi Aç</Link></td></tr>})}</tbody></table>{!open.length?<div className="empty">Açık servis kaydı bulunmuyor.</div>:null}</section>
    <section className="card section table-wrap"><div className="section-head"><div><div className="section-title">Son Tamamlanan Servisler</div><div className="page-sub">Geçmiş servis kayıtları silinmez; ilgili araç üzerinden tüm ikame geçmişi görüntülenebilir.</div></div></div><table className="table"><thead><tr><th>Araç</th><th>Servis</th><th>Giriş</th><th>Çıkış</th><th>Çıkış KM</th><th>İşlem</th></tr></thead><tbody>{recent.map(s=><tr key={s.id}><td><strong>{s.plate}</strong></td><td>{s.service_name}</td><td>{formatDateTime(s.service_in_at)}</td><td>{formatDateTime(s.service_out_at)}</td><td>{s.service_out_odometer==null?"—":`${formatNumber(s.service_out_odometer)} KM`}</td><td><Link className="btn btn-secondary" href={`/araclar/${s.vehicle_id}/servis-ikame`}>Geçmişi Aç</Link></td></tr>)}</tbody></table>{!recent.length?<div className="empty">Tamamlanmış servis kaydı bulunmuyor.</div>:null}</section>
  </>;
}
