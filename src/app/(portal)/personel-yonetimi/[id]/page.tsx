import {PersonnelSnapshot} from "@/components/personnel-snapshot";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/local/database";
import { formatDateTime } from "@/lib/format";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

export default async function PersonnelDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const db = getDatabase();
  const p = db.prepare("SELECT * FROM personnel WHERE id=?").get(id) as any;
  if (!p) notFound();
  if(p.status!=="ACTIVE")return <><h1 className="page-title">Personel Geçmişi</h1><p>Bu personel yeni işlemlerde kullanılamaz. Geçmiş belgeler ve kayıtlar korunmuştur.</p><Link href={`/personel-zimmetleri/personel/${id}`}>Zimmet Geçmişi</Link><br/><Link href={`/arac-kullanim-teslim?person=${id}`}>Araç Kullanım Geçmişi</Link></>;

  const deps = (db
    .prepare("SELECT name FROM system_definitions WHERE category='department' AND is_active=1 ORDER BY sort_order,name")
    .all() as any[]).map((x) => x.name);

  const assets = db.prepare(`
    SELECT pa.*,e.equipment_type,e.brand,e.model,e.serial_number,e.imei,e.imei2,e.asset_tag
    FROM personnel_assignments pa
    JOIN equipment e ON e.id=pa.equipment_id
    WHERE pa.personnel_id=?
    ORDER BY pa.assignment_date DESC,pa.created_at DESC,pa.id DESC
  `).all(id) as any[];

  const uses = db.prepare(`
    SELECT vu.*,v.plate,v.brand,v.model
    FROM vehicle_usage_records vu
    JOIN vehicles v ON v.id=vu.vehicle_id
    WHERE vu.personnel_id=?
    ORDER BY vu.checkout_at DESC,vu.created_at DESC,vu.id DESC
  `).all(id) as any[];

  const changes = db.prepare("SELECT created_at,old_values,new_values FROM audit_logs WHERE entity_id=? AND entity_type IN ('personnel','personnel_import') ORDER BY created_at DESC LIMIT 100").all(id) as any[];
  const fullName = `${p.first_name} ${p.last_name}`.trim();

  return <>
    <div className="page-head">
      <div>
        <Link className="page-sub" href="/personel-yonetimi">← Personel Yönetimi</Link>
        <h1 className="page-title" style={{ marginTop: 6 }}>{fullName}</h1>
        <div className="page-sub">{[p.company, p.branch, p.department].filter(Boolean).join(" • ") || "Personel kartı"}</div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Link className="btn btn-secondary" href={`/personel-zimmetleri/personel/${id}`}>Zimmet İşlemleri</Link>
        <span className={`pill ${p.status === "ACTIVE" ? "green" : "gray"}`}>{p.status === "ACTIVE" ? "Aktif" : "Eski / Pasif"}</span>
      </div>
    </div>

    {sp.saved ? <div className="success-box">Değişiklik kaydedildi.</div> : null}
    {sp.error ? <div className="error-box">{decodeURIComponent(sp.error)}</div> : null}

    <section className="card section">
      <div className="section-head"><div className="section-title">Personel Bilgileri</div></div>
      <div className="section-body">
        <form action="/api/personnel" method="post">
          <input type="hidden" name="operation" value="update" />
          <input type="hidden" name="personnel_id" value={id} />
          <input type="hidden" name="return_to" value={`/personel-yonetimi/${id}`} />
          <div className="form-grid">
            <div className="field"><label>Ad *</label><input className="input" name="first_name" defaultValue={p.first_name} required /></div>
            <div className="field"><label>Soyad *</label><input className="input" name="last_name" defaultValue={p.last_name} required /></div>
            
            <div className="field"><label>Şirket *</label><input className="input" name="company" defaultValue={p.company || ""} required/></div><div className="field"><label>Şube *</label><input className="input" name="branch" defaultValue={p.branch || ""} required/></div><div className="field"><label>Birim *</label><input className="input" name="department" defaultValue={p.department || ""} required/></div><div className="field"><label>İstenen Belgeler</label><input className="input" name="requested_documents" defaultValue={p.requested_documents || ""} /></div>
            
            <div className="field"><label>Telefon</label><input className="input" name="phone" inputMode="tel" defaultValue={p.phone || ""} /></div>
          </div>
          <div className="form-actions"><SubmitButton>Personeli Güncelle</SubmitButton></div>
        </form>

        <div className="form-actions" style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 16 }}>
          {p.status === "ACTIVE" ? (
            <form action="/api/personnel" method="post">
              <input type="hidden" name="operation" value="deactivate" />
              <input type="hidden" name="personnel_id" value={id} />
              <input type="hidden" name="return_to" value={`/personel-yonetimi/${id}`} />
              <ConfirmSubmitButton message={`${fullName} isimli personeli kaldırmak istediğinize emin misiniz? Personel yeni işlemlerde görünmeyecek ancak geçmiş kayıtları korunacaktır.`}>Personeli Sil</ConfirmSubmitButton>
            </form>
          ) : null}
        </div>
      </div>
    </section>

    <section className="card section table-wrap">
      <div className="section-head"><div><div className="section-title">Ekipman Zimmet Geçmişi</div><div className="page-sub">Personel silinse de geçmiş kayıtlar korunur.</div></div></div>
      <table className="table"><thead><tr><th>Ekipman</th><th>Seri / IMEI</th><th>Zimmet</th><th>İade</th><th>Durum</th></tr></thead><tbody>{assets.map((x) => <tr key={x.id}>
        <td><Link className="link-primary" href={`/personel-zimmetleri/demirbas/${x.equipment_id}`}>{[x.equipment_type, x.brand, x.model].filter(Boolean).join(" ")}</Link></td>
        <td>{x.serial_number || x.imei || x.imei2 || x.asset_tag || "—"}</td>
        <td>{formatDateTime(x.assignment_date)}<PersonnelSnapshot value={x.personnel_snapshot}/></td><td>{formatDateTime(x.return_date)}</td><td>{x.status}</td>
      </tr>)}</tbody></table>
      {!assets.length ? <div className="empty">Zimmet geçmişi bulunmuyor.</div> : null}
    </section>

    <section className="card section table-wrap">
      <div className="section-head"><div><div className="section-title">Araç Kullanım Geçmişi</div><div className="page-sub">Günlük / kısa süreli araç teslim kayıtları.</div></div></div>
      <table className="table"><thead><tr><th>Araç</th><th>Teslim</th><th>İade</th><th>Teslim KM</th><th>İade KM</th><th>Amaç</th><th>Durum</th></tr></thead><tbody>{uses.map((x) => <tr key={x.id}>
        <td><Link className="link-primary" href={`/araclar/${x.vehicle_id}`}>{x.plate}</Link></td><td>{formatDateTime(x.checkout_at)}<PersonnelSnapshot value={x.personnel_snapshot}/></td><td>{formatDateTime(x.return_at)}</td><td>{x.checkout_km_known?x.checkout_odometer:"—"}</td><td>{x.return_odometer ?? "—"}</td><td>{x.purpose || x.description || "—"}</td><td>{x.status === "IN_USE" ? "Kullanımda" : "Tamamlandı"}</td>
      </tr>)}</tbody></table>
      {!uses.length ? <div className="empty">Araç kullanım geçmişi bulunmuyor.</div> : null}
    </section>
  <section className="card section"><div className="section-head"><h2 className="section-title">Bilgi Değişikliği Geçmişi</h2></div><div className="section-body">{changes.map((x,i)=><details key={i}><summary>{formatDateTime(x.created_at)}</summary><pre style={{whiteSpace:"pre-wrap"}}>Önce: {x.old_values||"—"}{"\n"}Sonra: {x.new_values||"—"}</pre></details>)}</div></section></>;
}
