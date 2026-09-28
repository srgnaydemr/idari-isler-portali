import {personnelLabel} from "@/lib/search";
import {PersonnelSnapshot} from "@/components/personnel-snapshot";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/local/database";
import { formatDateTime } from "@/lib/format";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import { EquipmentFields } from "@/components/equipment-fields";

export const dynamic = "force-dynamic";

function localNow() {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const o = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`;
}
function durationText(start?: string | null, end?: string | null) {
  if (!start || !end) return "—";
  const parse = (v: string) => new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v) ? `${v}+03:00` : v).getTime();
  const ms = parse(end) - parse(start);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days <= 0) return hours > 0 ? `${hours} saat` : "Aynı gün";
  return hours > 0 ? `${days} gün ${hours} saat` : `${days} gün`;
}
const statusLabel = (status: string) => status === "RETURNED" ? "İade Edildi" : status === "DAMAGED" ? "Hasarlı İade" : status === "LOST" ? "Kayıp" : status === "ACTIVE" ? "Aktif" : status;
const statusPill = (status: string) => status === "RETURNED" ? "green" : status === "DAMAGED" ? "orange" : status === "LOST" ? "red" : "blue";

export default async function PersonnelAssets({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string; history_status?: string; saved?: string; error?: string; imported?: string; failed?: string; import_errors?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const db = getDatabase();
  const q = (sp.q || "").trim();
  const tab = ["current", "history", "inventory"].includes(String(sp.tab || "")) ? String(sp.tab) : "current";
  const historyStatus = ["all", "RETURNED", "DAMAGED", "LOST"].includes(String(sp.history_status || "")) ? String(sp.history_status) : "all";
  const like = `%${q}%`;
  const now = localNow();

  const counts = {
    active: Number((db.prepare("SELECT count(*) c FROM personnel_assignments WHERE status='ACTIVE' AND return_date IS NULL").get() as any)?.c || 0),
    history: Number((db.prepare("SELECT count(*) c FROM personnel_assignments WHERE return_date IS NOT NULL OR status<>'ACTIVE'").get() as any)?.c || 0),
    inventory: Number((db.prepare("SELECT count(*) c FROM equipment").get() as any)?.c || 0),
    available: Number((db.prepare("SELECT count(*) c FROM equipment WHERE status='AVAILABLE'").get() as any)?.c || 0),
    damaged: Number((db.prepare("SELECT count(*) c FROM equipment WHERE status='DAMAGED'").get() as any)?.c || 0),
  };

  const active = db.prepare(`SELECT pa.*,p.first_name||' '||p.last_name person_name,p.department,e.equipment_type,e.brand,e.model,e.serial_number,e.imei,e.imei2,e.asset_tag
    FROM personnel_assignments pa
    JOIN personnel p ON p.id=pa.personnel_id
    JOIN equipment e ON e.id=pa.equipment_id
    WHERE pa.return_date IS NULL AND pa.status='ACTIVE'
      AND (?='' OR p.first_name||' '||p.last_name LIKE ? COLLATE NOCASE OR COALESCE(p.department,'') LIKE ? COLLATE NOCASE OR COALESCE(e.equipment_type,'') LIKE ? COLLATE NOCASE OR COALESCE(e.brand,'') LIKE ? COLLATE NOCASE OR COALESCE(e.model,'') LIKE ? COLLATE NOCASE OR COALESCE(e.serial_number,'') LIKE ? COLLATE NOCASE OR COALESCE(e.imei,'') LIKE ? COLLATE NOCASE OR COALESCE(e.imei2,'') LIKE ? COLLATE NOCASE OR COALESCE(e.asset_tag,'') LIKE ? COLLATE NOCASE)
    ORDER BY pa.assignment_date DESC,pa.created_at DESC LIMIT 300`).all(q, like, like, like, like, like, like, like, like, like) as any[];

  const history = db.prepare(`SELECT pa.*,p.first_name||' '||p.last_name person_name,p.department,e.equipment_type,e.brand,e.model,e.serial_number,e.imei,e.imei2,e.asset_tag
    FROM personnel_assignments pa
    JOIN personnel p ON p.id=pa.personnel_id
    JOIN equipment e ON e.id=pa.equipment_id
    WHERE (pa.return_date IS NOT NULL OR pa.status<>'ACTIVE')
      AND (?='all' OR pa.status=?)
      AND (?='' OR p.first_name||' '||p.last_name LIKE ? COLLATE NOCASE OR COALESCE(p.department,'') LIKE ? COLLATE NOCASE OR COALESCE(e.equipment_type,'') LIKE ? COLLATE NOCASE OR COALESCE(e.brand,'') LIKE ? COLLATE NOCASE OR COALESCE(e.model,'') LIKE ? COLLATE NOCASE OR COALESCE(e.serial_number,'') LIKE ? COLLATE NOCASE OR COALESCE(e.imei,'') LIKE ? COLLATE NOCASE OR COALESCE(e.imei2,'') LIKE ? COLLATE NOCASE OR COALESCE(e.asset_tag,'') LIKE ? COLLATE NOCASE OR COALESCE(pa.return_note,'') LIKE ? COLLATE NOCASE)
    ORDER BY COALESCE(pa.return_date,pa.updated_at) DESC,pa.assignment_date DESC LIMIT 500`).all(historyStatus, historyStatus, q, like, like, like, like, like, like, like, like, like, like) as any[];

  const equipment = db.prepare(`SELECT e.*,p.first_name||' '||p.last_name assigned_person
    FROM equipment e
    LEFT JOIN personnel_assignments pa ON pa.equipment_id=e.id AND pa.return_date IS NULL AND pa.status='ACTIVE'
    LEFT JOIN personnel p ON p.id=pa.personnel_id
    WHERE (?='' OR COALESCE(e.equipment_type,'') LIKE ? COLLATE NOCASE OR COALESCE(e.brand,'') LIKE ? COLLATE NOCASE OR COALESCE(e.model,'') LIKE ? COLLATE NOCASE OR COALESCE(e.serial_number,'') LIKE ? COLLATE NOCASE OR COALESCE(e.imei,'') LIKE ? COLLATE NOCASE OR COALESCE(e.imei2,'') LIKE ? COLLATE NOCASE OR COALESCE(e.asset_tag,'') LIKE ? COLLATE NOCASE OR COALESCE(p.first_name||' '||p.last_name,'') LIKE ? COLLATE NOCASE)
    ORDER BY CASE e.status WHEN 'ASSIGNED' THEN 0 WHEN 'AVAILABLE' THEN 1 ELSE 2 END,e.equipment_type,e.brand,e.model LIMIT 500`).all(q, like, like, like, like, like, like, like, like) as any[];

  const activePersonnel = db.prepare("SELECT id,first_name,last_name,department,company,branch,phone,employee_no FROM personnel WHERE status='ACTIVE' AND deleted_at IS NULL ORDER BY last_name,first_name").all() as any[];
  const available = db.prepare("SELECT id,equipment_type,brand,model,serial_number,imei,imei2,asset_tag FROM equipment WHERE status='AVAILABLE' ORDER BY equipment_type,brand,model").all() as any[];
  const defs = (cat: string) => (db.prepare("SELECT name FROM system_definitions WHERE category=? AND is_active=1 ORDER BY sort_order,name").all(cat) as any[]).map(x => x.name);
  const types = defs("equipment_type");
  const personOptions = activePersonnel.map(p => ({ value: p.id, label: personnelLabel(p), searchText: [p.first_name, p.last_name, p.department, p.employee_no].filter(Boolean).join(" ") }));
  const equipOptions = available.map(e => ({ value: e.id, label: [e.equipment_type, e.brand, e.model, e.serial_number && `SN:${e.serial_number}`, e.imei && `IMEI:${e.imei}`, e.imei2 && `IMEI2:${e.imei2}`, e.asset_tag && `D:${e.asset_tag}`].filter(Boolean).join(" • "), searchText: [e.equipment_type, e.brand, e.model, e.serial_number, e.imei, e.imei2, e.asset_tag].filter(Boolean).join(" ") }));

  return <>
    <div className="page-head"><div><h1 className="page-title">Personel Zimmetleri</h1><div className="page-sub">Güncel zimmetleri, iade geçmişini ve ekipman havuzunu birbirinden ayrı yönetin.</div></div><div className="page-actions"><Link className="btn btn-secondary" href="/api/equipment-import">Örnek Excel Şablonunu İndir</Link><form action="/api/equipment-import" method="post" encType="multipart/form-data" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="file" name="file" className="input compact-file" accept=".xlsx" required/><button className="btn btn-primary" type="submit">Excel ile Ekipman Yükle</button></form><Link className="btn btn-secondary" href="/personel-yonetimi">Personel Yönetimi</Link></div></div>
    {sp.saved ? <div className="success-box">İşlem başarıyla tamamlandı.</div> : null}
    {sp.imported != null ? <div className="success-box">{Number(sp.imported || 0)} ekipman başarıyla eklendi{Number(sp.failed || 0) > 0 ? `, ${Number(sp.failed)} kayıt hatalı olduğu için eklenmedi.` : "."}</div> : null}
    {sp.import_errors ? <div className="warning-box">{decodeURIComponent(sp.import_errors)}</div> : null}
    {sp.error ? <div className="error-box">{sp.error}</div> : null}

    <div className="grid-kpi section"><div className="card kpi"><div className="kpi-label">Güncel Zimmet</div><div className="kpi-value">{counts.active}</div></div><div className="card kpi"><div className="kpi-label">Geçmiş Zimmet</div><div className="kpi-value">{counts.history}</div></div><div className="card kpi"><div className="kpi-label">Havuzdaki Ekipman</div><div className="kpi-value">{counts.available}</div></div><div className="card kpi"><div className="kpi-label">Hasarlı Ekipman</div><div className="kpi-value">{counts.damaged}</div></div></div>

    {tab === "current" ? <div className="two-col section"><form action="/api/personnel-assets" method="post" className="card"><input type="hidden" name="operation" value="create_equipment"/><input type="hidden" name="return_to" value="/personel-zimmetleri/envanter"/><div className="section-head"><div><div className="section-title">Yeni Ekipman</div><div className="page-sub">Yeni ekipman otomatik demirbaş numarasıyla havuza eklenir.</div></div></div><div className="section-body"><EquipmentFields types={types}/><div className="form-actions"><SubmitButton>Ekipman Oluştur</SubmitButton></div></div></form>
      <form action="/api/personnel-assets" method="post" encType="multipart/form-data" className="card"><input type="hidden" name="operation" value="assign"/><input type="hidden" name="return_to" value="/personel-zimmetleri/guncel"/><div className="section-head"><div><div className="section-title">Yeni Personel Zimmeti</div><div className="page-sub">Yalnızca aktif personel ve havuzdaki ekipman seçilebilir.</div></div></div><div className="section-body"><div className="form-grid"><SearchableSelect name="personnel_id" label="Personel" options={personOptions} required placeholder="Ad, soyad, departman veya personel no ara…" selectPlaceholder="Personel seçin"/><SearchableSelect name="equipment_id" label="Ekipman" options={equipOptions} required placeholder="Ekipman, marka, model, seri no, IMEI veya demirbaş ara…" selectPlaceholder="Ekipman seçin"/><div className="field"><label>Zimmet Tarihi *</label><input className="input" type="datetime-local" name="assignment_date" max={now} required/></div><div className="field"><label>Zimmet Formu</label><input className="input" type="file" name="file" accept=".pdf,.jpg,.jpeg,.png"/><small>PDF, JPG, JPEG veya PNG.</small></div><div className="field" style={{ gridColumn: "1/-1" }}><label>Açıklama</label><input className="input" name="description"/></div></div><div className="form-actions"><SubmitButton>Zimmeti Oluştur</SubmitButton></div></div></form></div> : null}

    <section className="card section"><div className="section-body"><div className="assignment-tabs"><Link className={`assignment-tab ${tab === "current" ? "active" : ""}`} href="/personel-zimmetleri/guncel">Güncel Zimmetler <span className="count">{counts.active}</span></Link><Link className={`assignment-tab ${tab === "history" ? "active" : ""}`} href="/personel-zimmetleri/gecmis">Geçmiş Zimmetler <span className="count">{counts.history}</span></Link><Link className={`assignment-tab ${tab === "inventory" ? "active" : ""}`} href="/personel-zimmetleri/envanter">Ekipman Envanteri <span className="count">{counts.inventory}</span></Link></div>
      <form className="filters section" method="get"><input type="hidden" name="tab" value={tab}/><input name="q" className="input filter-search" defaultValue={q} placeholder={tab === "inventory" ? "Ekipman türü, marka, model, seri no, IMEI, demirbaş veya personel ara…" : "Personel, ekipman, seri no, IMEI veya demirbaş ara…"}/>{tab === "history" ? <select className="select" name="history_status" defaultValue={historyStatus}><option value="all">Tüm İade Durumları</option><option value="RETURNED">İade Edildi</option><option value="DAMAGED">Hasarlı İade</option><option value="LOST">Kayıp</option></select> : null}<button className="btn btn-primary">Filtrele</button>{q || (tab === "history" && historyStatus !== "all") ? <Link className="btn btn-secondary" href={`/personel-zimmetleri?tab=${tab}`}>Temizle</Link> : null}</form>

      {tab === "current" ? <div className="table-wrap"><div className="section-head"><div><div className="section-title">Güncel Zimmetler</div><div className="page-sub">Yalnızca halen personel üzerinde bulunan ekipmanlar gösterilir.</div></div></div><table className="table"><thead><tr><th>Personel</th><th>Ekipman</th><th>Demirbaş / Seri No</th><th>Zimmet Tarihi</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{active.map(x => <tr key={x.id}><td><Link className="link-primary" href={`/personel-yonetimi/${x.personnel_id}`}>{x.personnel_snapshot?`${JSON.parse(x.personnel_snapshot).first_name} ${JSON.parse(x.personnel_snapshot).last_name}`:x.person_name}</Link><div className="page-sub"><PersonnelSnapshot value={x.personnel_snapshot}/></div></td><td>{[x.equipment_type, x.brand, x.model].filter(Boolean).join(" ")}</td><td>{x.asset_tag || "—"}<div className="page-sub">{x.serial_number ? `SN: ${x.serial_number}` : x.imei ? `IMEI: ${x.imei}` : ""}</div></td><td>{formatDateTime(x.assignment_date)}</td><td><span className="pill blue">Aktif Zimmet</span></td><td><div className="row-actions"><Link className="btn btn-secondary" href={`/personel-zimmetleri/demirbas/${x.equipment_id}`}>Görüntüle</Link><form action="/api/personnel-assets" method="post" className="inline-return-form"><input type="hidden" name="operation" value="return"/><input type="hidden" name="assignment_id" value={x.id}/><input type="hidden" name="return_to" value="/personel-zimmetleri/guncel"/><input className="input" type="datetime-local" name="return_date" min={String(x.assignment_date).slice(0, 16)} max={now} required/><select className="select" name="status" defaultValue="RETURNED"><option value="RETURNED">İade / Havuzda</option><option value="DAMAGED">Hasarlı</option></select><input className="input" name="return_note" placeholder="İade notu (isteğe bağlı)"/><SubmitButton>Zimmetten Düşür / İade Al</SubmitButton></form></div></td></tr>)}</tbody></table>{!active.length ? <div className="empty"><strong>Güncel zimmet bulunmuyor.</strong>Yeni zimmet oluşturduğunuzda burada görünecek.</div> : null}</div> : null}

      {tab === "history" ? <div className="table-wrap"><div className="section-head"><div><div className="section-title">Geçmiş Zimmetler</div><div className="page-sub">İade alınmış zimmetler silinmez; aynı ekipman daha sonra başka personele verilse bile geçmiş korunur.</div></div></div><table className="table"><thead><tr><th>Personel</th><th>Ekipman</th><th>Demirbaş</th><th>Zimmet Tarihi</th><th>İade Tarihi</th><th>Zimmet Süresi</th><th>İade Durumu</th><th>Açıklama</th><th>İşlem</th></tr></thead><tbody>{history.map(x => <tr key={x.id}><td>{x.personnel_snapshot?`${JSON.parse(x.personnel_snapshot).first_name} ${JSON.parse(x.personnel_snapshot).last_name}`:x.person_name}<div className="page-sub"><PersonnelSnapshot value={x.personnel_snapshot}/></div></td><td>{[x.equipment_type, x.brand, x.model].filter(Boolean).join(" ")}</td><td>{x.asset_tag || x.serial_number || "—"}</td><td>{formatDateTime(x.assignment_date)}</td><td>{formatDateTime(x.return_date)}</td><td>{durationText(x.assignment_date, x.return_date)}</td><td><span className={`pill ${statusPill(x.status)}`}>{statusLabel(x.status)}</span></td><td className="history-note">{x.return_note || x.description || "—"}</td><td><Link className="btn btn-secondary" href={`/personel-zimmetleri/demirbas/${x.equipment_id}`}>Görüntüle</Link></td></tr>)}</tbody></table>{!history.length ? <div className="empty"><strong>Geçmiş zimmet bulunamadı.</strong>İade alınan zimmetler burada kalıcı olarak listelenecek.</div> : null}</div> : null}

      {tab === "inventory" ? <div className="table-wrap"><div className="section-head"><div><div className="section-title">Ekipman Envanteri</div><div className="page-sub">Havuz, zimmetli ve hasarlı ekipmanları tek listede görüntüleyin.</div></div></div><table className="table"><thead><tr><th>Ekipman</th><th>Seri No</th><th>IMEI</th><th>IMEI 2</th><th>Demirbaş</th><th>Durum</th><th>Personel</th><th>İşlem</th></tr></thead><tbody>{equipment.map(e => <tr key={e.id}><td>{[e.equipment_type, e.brand, e.model].filter(Boolean).join(" ")}</td><td>{e.serial_number || "—"}</td><td>{e.imei || "—"}</td><td>{e.imei2 || "—"}</td><td>{e.asset_tag || "—"}</td><td><span className={`pill ${e.status === "AVAILABLE" ? "green" : e.status === "ASSIGNED" ? "blue" : e.status === "DAMAGED" ? "orange" : e.status === "LOST" ? "red" : "gray"}`}>{e.status === "AVAILABLE" ? "Havuzda" : e.status === "ASSIGNED" ? "Zimmetli" : e.status === "DAMAGED" ? "Hasarlı" : e.status === "SERVICE" ? "Serviste" : e.status === "INACTIVE" ? "Kullanım Dışı" : e.status === "LOST" ? "Kayıp" : e.status}</span></td><td>{e.assigned_person || "—"}</td><td><Link className="btn btn-secondary" href={`/personel-zimmetleri/demirbas/${e.id}`}>Görüntüle</Link></td></tr>)}</tbody></table>{!equipment.length ? <div className="empty"><strong>Ekipman bulunamadı.</strong>Arama kriterini değiştirin veya yeni ekipman oluşturun.</div> : null}</div> : null}
    </div></section>
  </>;
}
