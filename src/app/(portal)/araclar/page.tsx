import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { SetupNotice } from "@/components/setup-notice";
import { formatDateTime, formatNumber } from "@/lib/format";
import { vehicleOperationalStatus } from "@/lib/vehicle-operational-status";
import { getDatabase } from "@/lib/local/database";

const PAGE_SIZE = 50;

function listHref(sp: Record<string,string|undefined>, patch: Record<string,string|number|undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) params.set(k, v);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "") params.delete(k);
    else params.set(k, String(v));
  }
  const query = params.toString();
  return query ? `/araclar?${query}` : "/araclar";
}

export default async function Vehicles({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const sp = await searchParams;
  const { db, configured } = await requireUser();
  const page = Math.max(1, Number(sp.page || 1) || 1);
  const search = (sp.ara || sp.q || "").trim();
  const replacementMode = (sp.tur || sp.type) === "ikame" || sp.type === "replacement";
  const usage = sp.durum === "bosta" ? "available" : sp.durum === "zimmetli" ? "assigned" : sp.usage;
  const status = sp.durum === "gecici-kullanimda" ? "TEMP_IN_USE" : sp.durum === "serviste" ? "SERVICE" : sp.durum === "hasarli" ? "DAMAGED" : sp.status;
  const ownership = sp.mulkiyet === "filo" ? "FLEET" : sp.mulkiyet === "ozmal" ? "OWNED" : sp.ownership;
  const fleetCompany = sp.filo || sp.fleet_company;
  const inactive = sp.gorunum === "pasif" || sp.show === "inactive";
  let vehicles: any[] = [];
  let total = 0;
  let activeVehicleIds: string[] = [];
  let replacementVehicleIds: string[] = [];
  const raw = getDatabase();
  const fleetCompanies=(raw.prepare("SELECT name FROM system_definitions WHERE category='fleet_company' AND is_active=1 ORDER BY sort_order,name").all() as any[]).map(x=>x.name);

  if (db && !replacementMode) {
    if (search.length >= 2) {
      const like = `%${search.replace(/,/g, " ")}%`;
      const rr=raw.prepare("SELECT DISTINCT vehicle_id FROM vehicle_replacement_records WHERE replacement_plate LIKE ? COLLATE NOCASE LIMIT 500").all(like) as any[];
      replacementVehicleIds=rr.map(x=>String(x.vehicle_id));
    }
    const activeAssignments = await db.from("vehicle_assignments").select("vehicle_id").is("return_date", null).limit(5000);
    activeVehicleIds = Array.from(new Set((activeAssignments.data ?? []).map((x: any) => x.vehicle_id)));

    let query = db.from("vehicles")
      .select("id,plate,is_replacement,ownership_type,fleet_company,vehicle_type,brand,model,model_year,current_odometer,responsible_person,status,tire_storage_dealer,updated_at", { count: "exact" })
      .eq("is_replacement", 0)
      .eq("is_active", !inactive)
      .order("plate")
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (ownership) query = query.eq("ownership_type", ownership);
    if (status) query = query.eq("status", status);
    if (fleetCompany) query = query.eq("fleet_company", fleetCompany);
    if (usage === "assigned") {
      if (activeVehicleIds.length) query = query.in("id", activeVehicleIds);
      else query = query.eq("id", "00000000-0000-0000-0000-000000000000");
    }
    if (usage === "available") {
      query = query.eq("status", "ACTIVE");
      if (activeVehicleIds.length) query = query.not("id", "in", `(${activeVehicleIds.join(",")})`);
    }
    if (search.length >= 2) {
      const like = `%${search.replace(/,/g, " ")}%`;
      const searchParts=[`plate.ilike.${like}`,`brand.ilike.${like}`,`model.ilike.${like}`,`responsible_person.ilike.${like}`,`tire_storage_dealer.ilike.${like}`];
      if(replacementVehicleIds.length) searchParts.push(`id.in.(${replacementVehicleIds.join(",")})`);
      query = query.or(searchParts.join(","));
    }
    const result = await query;
    vehicles = result.data ?? [];
    total = result.count ?? 0;
  }

  let activeReplacements: any[] = [];
  if (replacementMode) {
    const replacements = raw.prepare(`SELECT r.*,v.plate AS main_plate
      FROM vehicle_replacement_records r
      JOIN vehicles v ON v.id=r.vehicle_id
      WHERE r.status='ACTIVE' AND r.replacement_returned_at IS NULL
      ORDER BY r.replacement_plate,r.replacement_received_at DESC`).all() as any[];
    const needle = search.toLocaleLowerCase("tr-TR");
    activeReplacements = search.length >= 2 ? replacements.filter(r => [r.replacement_plate,r.main_plate,r.replacement_brand_model,r.replacement_company].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR").includes(needle)) : replacements;
    total = activeReplacements.length;
  }
  const activeReplacementIds=activeReplacements.map(r=>String(r.id));
  const activeReplacementUses=activeReplacementIds.length ? raw.prepare(`SELECT * FROM vehicle_usage_records WHERE replacement_record_id IN (${activeReplacementIds.map(()=>"?").join(",")}) AND status='IN_USE' AND return_at IS NULL`).all(...activeReplacementIds) as any[] : [];
  const useByReplacement=new Map(activeReplacementUses.map(u=>[String(u.replacement_record_id),u]));
  const activeSet = new Set(activeVehicleIds);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return <>
    <div className="page-head"><div><h1 className="page-title">Araçlar</h1><div className="page-sub">Araç işlemlerinin merkezi başlangıç noktası • {formatNumber(total)} kayıt</div></div><div className="page-actions"><Link href="/araclar/sure-takibi-excel" className="btn btn-secondary">Süre Takibi Excel</Link><a href="/api/vehicle-import" className="btn btn-secondary" download>Excel Şablonunu İndir</a><Link href="/araclar/excel-yukle" className="btn btn-secondary">Excel’den Araç Yükle</Link><Link href="/araclar/yeni" className="btn btn-primary">Araç Ekle</Link></div></div>
    {!configured ? <SetupNotice /> : null}
    {sp.deleted === "1" ? <div className="success-box section">Araç kaydı silindi. Geçmiş ve işlem kayıtları korunmuştur.</div> : null}
    <form className="filters vehicle-filter-bar" method="get"><input className="input filter-search" name="ara" defaultValue={search} placeholder="Plaka, ikame plaka, marka, model, sorumlu veya lastik bayisi ara..."/>{replacementMode?<input type="hidden" name="tur" value="ikame"/>:null}<button className="btn btn-secondary" type="submit">Ara</button>{search ? <Link className="btn btn-secondary" href={replacementMode?"/araclar?tur=ikame":"/araclar"}>Aramayı Temizle</Link> : null}</form>
    <div className="filters">
      <Link className="btn btn-secondary" href="/araclar">Tümü</Link>
      <Link className="btn btn-secondary" href="/araclar?durum=bosta">Boşta</Link>
      <Link className="btn btn-secondary" href="/araclar?durum=zimmetli">Zimmetli</Link>
      <Link className="btn btn-secondary" href="/araclar?durum=gecici-kullanimda">Geçici Kullanımda</Link>
      <Link className="btn btn-secondary" href="/araclar?durum=serviste">Serviste</Link>
      <Link className="btn btn-secondary" href="/araclar?durum=hasarli">Hasarlı</Link>
      <Link className="btn btn-secondary" href="/araclar?mulkiyet=filo">Filo</Link>
      <Link className="btn btn-secondary" href="/araclar?mulkiyet=ozmal">Özmal</Link>
      {fleetCompanies.map((x:string)=><Link className="btn btn-secondary" key={x} href={`/araclar?mulkiyet=filo&filo=${encodeURIComponent(x)}`}>{x}</Link>)}
      <Link className={`btn btn-secondary ${replacementMode?"active":""}`} href="/araclar?tur=ikame">İkame Araçlar</Link>
      <Link className="btn btn-secondary" href="/araclar?gorunum=pasif">Silinen / Pasif Araçlar</Link>
    </div>
    {replacementMode ? <div className="card table-wrap"><table className="table"><thead><tr><th>İkame Plaka</th><th>Bağlı Olduğu Ana Araç</th><th>Başlangıç</th><th>KM</th><th>Kullanım Durumu</th><th>İlgili İşlem</th></tr></thead><tbody>{activeReplacements.map(r=>{const use=useByReplacement.get(String(r.id));const href=r.source_type==="SERVICE"?`/araclar/${r.vehicle_id}/servis-ikame`:r.source_type==="DAMAGE"?`/kaza-hasar/hasar/${r.source_id}`:`/kaza-hasar/${r.source_id}`;return <tr key={r.id}><td><strong>{r.replacement_plate}</strong><div className="page-sub">Aktif ikame araç</div></td><td><Link className="link-primary" href={`/araclar/${r.vehicle_id}`}>{r.main_plate}</Link></td><td>{formatDateTime(r.replacement_received_at)}</td><td>{r.replacement_odometer==null?"—":formatNumber(r.replacement_odometer)}</td><td><span className={`pill ${use?"orange":"blue"}`}>{use?`Personelde kullanımda${use.personnel_name_snapshot?` — ${use.personnel_name_snapshot}`:""}`:"Kullanıma uygun"}</span></td><td><Link className="btn btn-secondary" href={href}>Kaydı Aç</Link></td></tr>})}</tbody></table>{!activeReplacements.length ? <div className="empty">Aktif ikame araç bulunmuyor.</div> : null}</div> : <div className="card table-wrap"><table className="table"><thead><tr><th>Plaka</th><th>Mülkiyet</th><th>Filo Şirketi</th><th>Marka / Model</th><th>Yıl</th><th>KM</th><th>Zimmet / Sorumlu</th><th>Durum</th><th>Lastik Depo Bayisi</th></tr></thead><tbody>{vehicles.map(v => { const st = vehicleOperationalStatus(v.status, activeSet.has(v.id), v.status === "SERVICE"); return <tr key={v.id}><td><Link href={`/araclar/${v.id}`} style={{fontWeight:800,color:"#163a5f"}}>{v.plate}</Link></td><td><span className={`pill ${v.ownership_type === "FLEET" ? "blue" : "gray"}`}>{v.ownership_type === "FLEET" ? "Kiralık / Filo" : "Özmal"}</span></td><td>{v.ownership_type === "FLEET" ? (v.fleet_company || "—") : "—"}</td><td>{v.brand} {v.model}</td><td>{v.model_year}</td><td>{formatNumber(v.current_odometer)}</td><td>{v.responsible_person || "—"}</td><td><span className={`pill ${st.pill}`}>{st.label}</span></td><td>{v.tire_storage_dealer || "—"}</td></tr>})}</tbody></table>{!vehicles.length ? <div className="empty">Arama veya filtreye uygun araç kaydı bulunmuyor.</div> : null}</div>}
    {!replacementMode && total > PAGE_SIZE ? <div className="pagination"><div className="page-sub">Sayfa {page} / {pageCount}</div><div className="pagination-actions">{page > 1 ? <Link className="btn btn-secondary" href={listHref(sp,{page:page-1})}>← Önceki</Link> : null}{page < pageCount ? <Link className="btn btn-secondary" href={listHref(sp,{page:page+1})}>Sonraki →</Link> : null}</div></div> : null}
  </>;
}
