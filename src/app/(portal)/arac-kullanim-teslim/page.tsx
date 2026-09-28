import {personnelLabel} from "@/lib/search";
import {PersonnelSnapshot} from "@/components/personnel-snapshot";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/local/database";
import { formatDateTime, formatNumber } from "@/lib/format";
import { SubmitButton } from "@/components/submit-button";
import { SearchableSelect } from "@/components/searchable-select";

export const dynamic = "force-dynamic";
function localInputNow() { const d = new Date(); const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d); const o = Object.fromEntries(parts.map(x => [x.type, x.value])); return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`; }

export default async function VehicleUsage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; start?: string; end?: string; vehicle?: string; person?: string; saved?: string; error?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const db = getDatabase();
  const q = (sp.q || "").trim();
  const status = ["IN_USE", "COMPLETED", "ALL"].includes(sp.status || "") ? String(sp.status) : "ALL";
  const start = String(sp.start || ""); const end = String(sp.end || ""); const vehicleFilter = String(sp.vehicle || ""); const personFilter = String(sp.person || "");
  const nowLocal = localInputNow();
  const vehicles = db.prepare("SELECT id,plate,brand,model,current_odometer,is_replacement FROM vehicles WHERE is_active=1 ORDER BY plate").all() as any[];
  const personnel = db.prepare("SELECT id,first_name,last_name,department,company,branch,phone FROM personnel WHERE status='ACTIVE' AND deleted_at IS NULL ORDER BY last_name,first_name").all() as any[];
  const purposes = (db.prepare("SELECT name FROM system_definitions WHERE category='vehicle_usage_purpose' AND is_active=1 ORDER BY sort_order,name").all() as any[]).map(x => x.name);

  const conditions = ["1=1"]; const args: any[] = [];
  if (status !== "ALL") { conditions.push("vu.status=?"); args.push(status); }
  if (vehicleFilter) { conditions.push("vu.vehicle_id=?"); args.push(vehicleFilter); }
  if (personFilter) { conditions.push("vu.personnel_id=?"); args.push(personFilter); }
  if (start) { conditions.push("substr(vu.checkout_at,1,10)>=?"); args.push(start); }
  if (end) { conditions.push("substr(vu.checkout_at,1,10)<=?"); args.push(end); }
  conditions.push("(?='' OR v.plate LIKE ? COLLATE NOCASE OR vu.personnel_name_snapshot LIKE ? COLLATE NOCASE OR COALESCE(vu.department_snapshot,'') LIKE ? COLLATE NOCASE OR COALESCE(vu.description,'') LIKE ? COLLATE NOCASE OR COALESCE(vu.purpose,'') LIKE ? COLLATE NOCASE)");
  args.push(q, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  const rows = db.prepare(`SELECT vu.*,v.plate,v.brand,v.model,v.is_replacement FROM vehicle_usage_records vu JOIN vehicles v ON v.id=vu.vehicle_id WHERE ${conditions.join(" AND ")} ORDER BY vu.checkout_at DESC,vu.created_at DESC,vu.id DESC LIMIT 500`).all(...args) as any[];
  const active = db.prepare(`SELECT vu.*,v.plate,v.brand,v.model,v.is_replacement FROM vehicle_usage_records vu JOIN vehicles v ON v.id=vu.vehicle_id WHERE vu.status='IN_USE' AND vu.return_at IS NULL ORDER BY vu.checkout_at DESC,vu.created_at DESC,vu.id DESC`).all() as any[];

  const vehicleOptions = vehicles.map(v => ({ value: v.id, label: `${v.plate}${v.is_replacement?" – İkame Araç":""} • ${v.brand} ${v.model} • ${formatNumber(v.current_odometer)} KM`, searchText: `${v.plate} ${v.brand} ${v.model}` }));
  const personnelOptions = personnel.map(p => ({ value: p.id, label: personnelLabel(p), searchText: `${p.first_name} ${p.last_name} ${p.department || ""}` }));

  return <>
    <div className="page-head"><div><h1 className="page-title">Araç Kullanım / Araç Teslim Kayıtları</h1><div className="page-sub">Uzun süreli araç zimmetinden ayrı günlük ve kısa süreli şirket içi araç kullanım takibi.</div></div></div>
    {sp.saved ? <div className="success-box">{sp.saved === "return" ? "Araç iadesi tamamlandı ve güncel kilometre güncellendi." : "Araç personele teslim edildi."}</div> : null}
    {sp.error ? <div className="error-box">{decodeURIComponent(sp.error)}</div> : null}

    <form action="/api/vehicle-usage" method="post" className="card section">
      <input type="hidden" name="operation" value="checkout" /><input type="hidden" name="return_to" value="/arac-kullanim-teslim" />
      <div className="section-head"><div><div className="section-title">Yeni Araç Kullanım Kaydı</div><div className="page-sub">Personel zorunludur. Kullanımda olan araç ikinci kişiye verilemez.</div></div></div>
      <div className="section-body"><div className="form-grid">
        <SearchableSelect name="vehicle_id" label="Araç / Plaka" options={vehicleOptions} required placeholder="Plaka, marka veya model ara…" selectPlaceholder="Araç seçin" />
        <SearchableSelect name="personnel_id" label="Aracı Teslim Alan Personel" options={personnelOptions} required placeholder="Ad, soyad veya departman ara…" selectPlaceholder="Personel seçin" />
        <div className="field"><label>Teslim Alma Tarihi / Saati *</label><input className="input" type="datetime-local" name="checkout_at" max={nowLocal} required /></div>
        <div className="field"><label>Teslim Alma KM (ikame için isteğe bağlı)</label><input className="input" type="number" min="0" name="checkout_odometer" /></div>
        <div className="field"><label>Kullanım Amacı</label><select className="select" name="purpose"><option value="">Seçin</option>{purposes.map(x => <option key={x}>{x}</option>)}</select></div>
        <div className="field" style={{ gridColumn: "1/-1" }}><label>Açıklama / Not</label><textarea className="textarea" name="description" rows={2} /></div>
      </div><div className="form-actions"><SubmitButton>Aracı Teslim Et</SubmitButton></div></div>
    </form>

    {active.length ? <section className="card section table-wrap"><div className="section-head"><div><div className="section-title">Şu Anda Kullanımda Olan Araçlar</div><div className="page-sub">İade işlemi aynı kayıt üzerinden tamamlanır.</div></div></div><table className="table"><thead><tr><th>Araç</th><th>Personel</th><th>Departman</th><th>Teslim</th><th>Teslim KM</th><th>Amaç</th><th>İade</th></tr></thead><tbody>{active.map(x => <tr key={x.id}><td>{x.is_replacement?<strong>{x.plate}</strong>:<Link className="link-primary" href={`/araclar/${x.vehicle_id}/gecmis`}>{x.plate}</Link>}{x.main_plate_snapshot?<div className="page-sub">İkame • Ana araç: {x.main_plate_snapshot}</div>:null}</td><td><Link className="link-primary" href={`/personel-yonetimi/${x.personnel_id}`}>{x.personnel_name_snapshot}</Link><PersonnelSnapshot value={x.personnel_snapshot}/></td><td><PersonnelSnapshot value={x.personnel_snapshot}/></td><td>{formatDateTime(x.checkout_at)}</td><td>{x.checkout_km_known?formatNumber(x.checkout_odometer):"—"}</td><td>{x.purpose || x.description || "—"}</td><td><form action="/api/vehicle-usage" method="post"><input type="hidden" name="operation" value="return" /><input type="hidden" name="usage_id" value={x.id} /><input type="hidden" name="return_to" value="/arac-kullanim-teslim" /><input className="input" type="datetime-local" name="return_at" min={String(x.checkout_at).slice(0, 16)} required /><input className="input" type="number" min={x.checkout_odometer} name="return_odometer" placeholder="İade KM (ikame için isteğe bağlı)" style={{ marginTop: 5 }} /><input className="input" name="return_note" placeholder="İade notu" style={{ marginTop: 5 }} /><SubmitButton className="btn btn-primary">Aracı İade Al</SubmitButton></form></td></tr>)}</tbody></table></section> : null}

    <form className="filters section" method="get">
      <input className="input filter-search" name="q" defaultValue={q} placeholder="Plaka, personel, departman, amaç veya açıklama ara…" />
      <select className="select" name="status" defaultValue={status}><option value="ALL">Tüm Durumlar</option><option value="IN_USE">Kullanımda</option><option value="COMPLETED">Tamamlandı</option></select>
      <select className="select" name="vehicle" defaultValue={vehicleFilter}><option value="">Tüm Araçlar</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}</select>
      <select className="select" name="person" defaultValue={personFilter}><option value="">Tüm Personeller</option>{personnel.map(p => <option key={p.id} value={p.id}>{personnelLabel(p)}</option>)}</select>
      <input className="input" type="date" name="start" defaultValue={start} max={nowLocal.slice(0, 10)} title="Başlangıç tarihi" />
      <input className="input" type="date" name="end" defaultValue={end} max={nowLocal.slice(0, 10)} title="Bitiş tarihi" />
      <button className="btn btn-primary">Ara / Filtrele</button>{q || status !== "ALL" || start || end || vehicleFilter || personFilter ? <Link href="/arac-kullanim-teslim" className="btn btn-secondary">Temizle</Link> : null}
    </form>

    <section className="card section table-wrap"><div className="section-head"><div className="section-title">Araç Kullanım Geçmişi</div></div><table className="table"><thead><tr><th>Araç</th><th>Personel</th><th>Departman</th><th>Teslim</th><th>İade</th><th>KM</th><th>Amaç / Açıklama</th><th>Durum</th></tr></thead><tbody>{rows.map(x => <tr key={x.id}><td>{x.is_replacement?<strong>{x.plate}</strong>:<Link className="link-primary" href={`/araclar/${x.vehicle_id}/gecmis`}>{x.plate}</Link>}{x.main_plate_snapshot?<div className="page-sub">İkame • Ana araç: {x.main_plate_snapshot}</div>:null}</td><td><Link className="link-primary" href={`/personel-yonetimi/${x.personnel_id}`}>{x.personnel_name_snapshot}</Link><PersonnelSnapshot value={x.personnel_snapshot}/></td><td><PersonnelSnapshot value={x.personnel_snapshot}/></td><td>{formatDateTime(x.checkout_at)}</td><td>{formatDateTime(x.return_at)}</td><td>{x.checkout_km_known?formatNumber(x.checkout_odometer):"—"} → {x.return_odometer != null ? formatNumber(x.return_odometer) : "—"}</td><td>{x.purpose || "—"}{x.description ? <div className="page-sub">{x.description}</div> : null}{x.return_note ? <div className="page-sub">İade: {x.return_note}</div> : null}</td><td><span className={`pill ${x.status === "IN_USE" ? "blue" : "green"}`}>{x.status === "IN_USE" ? "Kullanımda" : "Tamamlandı"}</span></td></tr>)}</tbody></table>{!rows.length ? <div className="empty"><strong>Henüz araç kullanım kaydı bulunmuyor.</strong>Yeni bir araç teslimi oluşturduğunuzda burada görünecek.</div> : null}</section>
  </>;
}
