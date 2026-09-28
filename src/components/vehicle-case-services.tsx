import Link from 'next/link';
import {getDatabase} from '@/lib/local/database';
import {formatDateTime,formatNumber} from '@/lib/format';
export function VehicleCaseServices({vehicleId}:{vehicleId:string}) {
 const rows=getDatabase().prepare('SELECT * FROM case_services WHERE vehicle_id=? ORDER BY created_at DESC,id DESC').all(vehicleId) as any[];
 return <section className="card section table-wrap"><div className="section-head"><h2 className="section-title">Kaza / Hasar Servis Geçmişi</h2></div><table className="table"><thead><tr><th>Servis</th><th>Giriş</th><th>Giriş KM</th><th>Çıkış</th><th>Çıkış KM</th><th>Dosya</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.service_name}</td><td>{formatDateTime(r.entry_at)}</td><td>{formatNumber(r.entry_km)}</td><td>{formatDateTime(r.exit_at)}</td><td>{r.exit_km==null?'—':formatNumber(r.exit_km)}</td><td><Link className="btn btn-secondary" href={r.source_type==='ACCIDENT'?`/kaza-hasar/${r.source_id}`:`/kaza-hasar/hasar/${r.source_id}`}>Dosyayı Aç</Link></td></tr>)}</tbody></table>{!rows.length&&<div className="empty">Kaza / hasar servis hareketi bulunmuyor.</div>}</section>;
}
