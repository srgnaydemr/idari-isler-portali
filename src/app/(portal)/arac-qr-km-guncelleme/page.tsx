import Link from "next/link";
import {requireUser} from "@/lib/auth";
import {getDatabase} from "@/lib/local/database";
import {formatDateTime,formatNumber} from "@/lib/format";
import {SubmitButton} from "@/components/submit-button";

export const dynamic="force-dynamic";
export const revalidate=0;

type Row={id:string;plate:string;brand:string;model:string;current_odometer:number;is_active:number;created_at:string;qr_id:string|null;qr_active:number|null;qr_created_at:string|null;last_used_at:string|null;last_km_update:string|null};

export default async function VehicleQrPage({searchParams}:{searchParams:Promise<{q?:string;status?:string;saved?:string;error?:string}>}){
  await requireUser();
  const sp=await searchParams;
  const db=getDatabase();
  const staleDays=Math.max(1,Number((db.prepare("SELECT setting_value FROM system_settings WHERE setting_key='qr_stale_days'").get() as any)?.setting_value||21));
  const rows=db.prepare(`SELECT v.id,v.plate,v.brand,v.model,v.current_odometer,v.is_active,v.created_at,
    q.id qr_id,q.is_active qr_active,q.created_at qr_created_at,q.last_used_at,
    (SELECT h.recorded_at FROM vehicle_odometer_history h WHERE h.vehicle_id=v.id ORDER BY datetime(h.recorded_at) DESC LIMIT 1) last_km_update
    FROM vehicles v LEFT JOIN vehicle_qr_codes q ON q.vehicle_id=v.id
    WHERE v.is_replacement=0
    ORDER BY v.is_active DESC,v.plate`).all() as Row[];
  const q=String(sp.q||"").trim().toLocaleUpperCase("tr-TR"),status=String(sp.status||"");
  const filtered=rows.filter(r=>{
    if(q&&!`${r.plate} ${r.brand||""} ${r.model||""}`.toLocaleUpperCase("tr-TR").includes(q))return false;
    if(status==="active"&&!(r.qr_id&&Number(r.qr_active)===1&&Number(r.is_active)===1))return false;
    if(status==="inactive"&&!(r.qr_id&&Number(r.qr_active)===0))return false;
    if(status==="missing"&&r.qr_id)return false;
    if(status==="never"&&r.last_km_update)return false;
    if(["stale","stale7","stale15","stale30"].includes(status)){
      const days=status==="stale7"?7:status==="stale15"?15:status==="stale30"?30:staleDays;
      const cutoff=new Date(Date.now()-days*86400000).toISOString();
      const baseline=r.last_km_update||r.created_at;
      if(baseline&&String(baseline)>=cutoff)return false;
    }
    return true;
  });
  const total=rows.filter(x=>Number(x.is_active)===1).length;
  const activeQr=rows.filter(x=>Number(x.is_active)===1&&x.qr_id&&Number(x.qr_active)===1).length;
  const missing=rows.filter(x=>Number(x.is_active)===1&&!x.qr_id).length;
  const weekAgo=new Date(Date.now()-7*86400000).toISOString();
  const last7=Number((db.prepare("SELECT count(DISTINCT u.vehicle_id) c FROM vehicle_qr_km_updates u JOIN vehicles v ON v.id=u.vehicle_id WHERE v.is_replacement=0 AND u.created_at>=?").get(weekAgo) as any)?.c||0);

  return <div className="page-stack">
    <div className="page-header"><div><h1>Araç QR / KM Güncelleme</h1><div className="page-sub">Yalnızca normal filo/kiralık ve özmal araçlar için QR oluşturun; ikame araçlar bu sisteme dahil edilmez.</div></div><div className="header-actions"><Link className="btn btn-secondary" href="/arac-qr-km-guncelleme/yazdir">Toplu QR Yazdır</Link><form action="/api/vehicle-qr" method="post"><input type="hidden" name="operation" value="bulk_create"/><input type="hidden" name="return_to" value="/arac-qr-km-guncelleme"/><SubmitButton>Eksik QR Kodlarını Toplu Oluştur</SubmitButton></form></div></div>
    {sp.saved?<div className="success-box">{String(sp.saved)}</div>:null}
    {sp.error?<div className="error-box">{String(sp.error)}</div>:null}
    <div className="stats-grid qr-stats"><div className="stat-card"><span>Toplam Araç</span><strong>{total}</strong></div><div className="stat-card"><span>Aktif QR</span><strong>{activeQr}</strong></div><div className="stat-card"><span>QR Oluşturulmamış</span><strong>{missing}</strong></div><div className="stat-card"><span>Son 7 Günde QR ile Güncellenen</span><strong>{last7}</strong></div></div>
    <section className="card section qr-filter-card"><form className="filter-row" method="get"><div className="field grow"><label>Plaka / Araç Ara</label><input className="input" name="q" defaultValue={sp.q||""} placeholder="34 MAS 831"/></div><div className="field"><label>QR Durumu</label><select className="select" name="status" defaultValue={status}><option value="">Tümü</option><option value="active">Aktif QR</option><option value="missing">QR Oluşturulmamış</option><option value="inactive">Pasif QR</option><option value="stale">Uzun Süredir KM Güncellenmeyen</option><option value="stale7">7 Gündür Güncellenmeyen</option><option value="stale15">15 Gündür Güncellenmeyen</option><option value="stale30">30 Gündür Güncellenmeyen</option><option value="never">Hiç KM Güncellenmemiş</option></select></div><div className="form-actions"><button className="btn btn-primary" type="submit">Filtrele</button><Link className="btn btn-secondary" href="/arac-qr-km-guncelleme">Temizle</Link></div></form></section>
    <section className="card table-wrap"><table className="table"><thead><tr><th>Plaka</th><th>Marka / Model</th><th>Güncel KM</th><th>QR Durumu</th><th>Son QR KM Girişi</th><th>İşlem</th></tr></thead><tbody>{filtered.map(r=>{const active=Boolean(r.qr_id&&Number(r.qr_active)===1&&Number(r.is_active)===1);return <tr key={r.id}><td><strong>{r.plate}</strong>{!Number(r.is_active)?<div><span className="pill gray">Araç Pasif</span></div>:null}</td><td>{[r.brand,r.model].filter(Boolean).join(" ")||"—"}</td><td>{formatNumber(Number(r.current_odometer||0))} KM</td><td>{!r.qr_id?<span className="pill gray">Oluşturulmadı</span>:active?<span className="pill green">Aktif</span>:<span className="pill red">Pasif</span>}</td><td>{r.last_used_at?formatDateTime(r.last_used_at):"—"}<div className="page-sub">Son KM: {r.last_km_update?formatDateTime(r.last_km_update):"Hiç güncellenmedi"}</div></td><td><div className="table-actions">{r.qr_id?<><Link className="btn btn-secondary" href={`/arac-qr-km-guncelleme/${r.id}`}>QR Görüntüle</Link><a className="btn btn-secondary" href={`/api/vehicle-qr/image?vehicle_id=${r.id}&download=1`}>QR İndir</a><Link className="btn btn-secondary" href={`/arac-qr-km-guncelleme/yazdir?vehicle_id=${r.id}`}>Yazdır</Link><Link className="btn btn-secondary" href={`/arac-qr-km-guncelleme/${r.id}#history`}>KM Geçmişi</Link></>:Number(r.is_active)?<form action="/api/vehicle-qr" method="post"><input type="hidden" name="operation" value="create"/><input type="hidden" name="vehicle_id" value={r.id}/><input type="hidden" name="return_to" value="/arac-qr-km-guncelleme"/><SubmitButton>QR Oluştur</SubmitButton></form>:null}</div></td></tr>})}</tbody></table>{!filtered.length?<div className="empty">Filtreye uygun araç bulunamadı.</div>:null}</section>
    <div className="notice"><strong>Not:</strong> İkame araçlar QR/KM sisteminden tamamen hariç tutulur. QR kodu mevcut portal alan adını kullanır; canlı ortamda kalıcı alan adı kullanmanız önerilir. Olağandışı yüksek KM artışlarında saha kullanıcısından ek onay istenir.</div>
  </div>
}
