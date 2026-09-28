import {annualCosts,currentYear} from "@/lib/annual-costs";
import {CostHistory} from "@/components/cost-history";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/local/database";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { actionLabel, accidentStatusLabel, moduleLabel, paymentStatusLabel, uiLabel, vehicleStatusLabel } from "@/lib/labels";

const categoryOrder = ["Araç Raporları", "Zimmet Raporları", "Servis / Bakım Raporları", "Kaza / Hasar Raporları", "Trafik Cezaları", "Sistem"];

export default async function Reports({ searchParams }: { searchParams: Promise<{ report?: string; q?: string; year?:string }> }) {
  const { report = "", q = "", year:selectedYear } = await searchParams;
  const { db } = await requireUser();
  const raw = getDatabase();
  const allCosts=annualCosts(),thisYear=currentYear();
  const costYear=/^\d{4}$/.test(selectedYear||"")?Number(selectedYear):thisYear;
  const years=Array.from(new Set([thisYear,costYear,...allCosts.map(r=>r.year)])).sort((a,b)=>b-a);
  let catalog: any[] = [];
  let rows: any[] = [];
  let costs: any = { maintenance: 0, damage: 0, fines: 0, tires: 0, total: 0 };

  if (db) {
    const year = costYear;
    const [cat, mc, sc, ac, dc, fc, tc] = await Promise.all([
      db.from("report_catalog").select("slug,name,report_type,category,description,sort_order").eq("is_active", true).order("sort_order"),
      db.from("vehicle_maintenance").select("cost").gte("maintenance_date", `${year}-01-01`).lte("maintenance_date", `${year}-12-31`),
      db.from("vehicle_service_records").select("cost").gte("service_in_at", `${year}-01-01T00:00:00`).lte("service_in_at", `${year}-12-31T23:59:59`),
      db.from("vehicle_accidents").select("actual_cost").gte("accident_date", `${year}-01-01`).lte("accident_date", `${year}-12-31`),
      db.from("vehicle_damages").select("cost").gte("damage_date", `${year}-01-01`).lte("damage_date", `${year}-12-31`),
      db.from("vehicle_traffic_fines").select("amount").gte("fine_date", `${year}-01-01`).lte("fine_date", `${year}-12-31`),
      db.from("vehicle_tire_transactions").select("cost").gte("transaction_date", `${year}-01-01`).lte("transaction_date", `${year}-12-31`),
    ]);
    catalog = cat.data ?? [];
    costs = {
      maintenance: (mc.data ?? []).reduce((s:number, r:any) => s + Number(r.cost || 0), 0) + (sc.data ?? []).reduce((s:number, r:any) => s + Number(r.cost || 0), 0),
      damage: (ac.data ?? []).reduce((s:number, r:any) => s + Number(r.actual_cost || 0), 0) + (dc.data ?? []).reduce((s:number, r:any) => s + Number(r.cost || 0), 0),
      fines: (fc.data ?? []).reduce((s:number, r:any) => s + Number(r.amount || 0), 0),
      tires: (tc.data ?? []).reduce((s:number, r:any) => s + Number(r.cost || 0), 0),
      total: 0,
    };
    costs.total=costs.maintenance+costs.damage+costs.fines+costs.tires;

    if (report === "vehicle-list") rows = (await db.from("vehicles").select("id,plate,ownership_type,brand,model,model_year,current_odometer,responsible_person,status,tire_storage_dealer").eq("is_active", true).order("plate").limit(500)).data ?? [];
    if (report === "fleet-vehicles") rows = (await db.from("vehicles").select("id,plate,brand,model,contract_end_date,contract_km_limit,responsible_person,status").eq("is_active", true).eq("ownership_type", "FLEET").order("plate").limit(500)).data ?? [];
    if (report === "owned-vehicles") rows = (await db.from("vehicles").select("id,plate,brand,model,model_year,current_odometer,responsible_person,status").eq("is_active", true).eq("ownership_type", "OWNED").order("plate").limit(500)).data ?? [];
    if (report === "maintenance") {
      const [legacy, central] = await Promise.all([
        db.from("vehicle_maintenance").select("id,maintenance_date,maintenance_type,service_name,status,cost,vehicles(plate)").order("maintenance_date", { ascending: false }).limit(300),
        db.from("vehicle_service_records").select("id,service_in_at,service_reason,service_name,status,cost,vehicles(plate)").order("service_in_at", { ascending: false }).limit(300),
      ]);
      rows = [...(central.data ?? []).map((r: any) => ({ id: r.id, maintenance_date: r.service_in_at, maintenance_type: r.service_reason, service_name: r.service_name, status: r.status === "OPEN" ? "IN_SERVICE" : "COMPLETED", cost: r.cost, vehicles: r.vehicles })), ...(legacy.data ?? [])].sort((a: any, b: any) => new Date(b.maintenance_date).getTime() - new Date(a.maintenance_date).getTime()).slice(0, 500);
    }
    if (report === "accident-damage") rows = (await db.from("vehicle_accidents").select("id,file_number,accident_date,status,actual_cost,vehicles(plate)").order("accident_date", { ascending: false }).limit(500)).data ?? [];
    if (report === "traffic-fines") rows = (await db.from("vehicle_traffic_fines").select("id,fine_date,fine_type,amount,payment_status,driver,vehicles(plate)").order("fine_date", { ascending: false }).limit(500)).data ?? [];
    if (report === "tire-history") rows = raw.prepare(`SELECT t.id,t.transaction_date,t.transaction_time,t.odometer,t.transaction_type,t.performed_by_name,t.description,t.cost,v.id vehicle_id,v.plate FROM vehicle_tire_transactions t JOIN vehicles v ON v.id=t.vehicle_id ORDER BY t.transaction_date DESC,COALESCE(t.transaction_time,'' ) DESC,t.created_at DESC LIMIT 500`).all() as any[];
    if (report === "vehicle-cost") rows = [{ id: "vehicle-cost", ...costs }];
    if (report === "audit-log") rows = (await db.from("audit_logs").select("id,created_at,user_name_snapshot,module,action,entity_reference").order("created_at", { ascending: false }).limit(500)).data ?? [];

    if (report === "replacement-history") rows = raw.prepare(`SELECT rr.id,rr.source_type,rr.source_id,rr.replacement_plate,rr.replacement_received_at,rr.replacement_returned_at,rr.replacement_company,rr.status,v.plate FROM vehicle_replacement_records rr JOIN vehicles v ON v.id=rr.vehicle_id ORDER BY COALESCE(rr.replacement_received_at,rr.created_at) DESC,rr.created_at DESC LIMIT 500`).all() as any[];
    if (report === "active-vehicle-assignments") rows = raw.prepare(`SELECT va.id,va.assigned_to,va.delivery_date,va.delivery_odometer,v.id vehicle_id,v.plate FROM vehicle_assignments va JOIN vehicles v ON v.id=va.vehicle_id WHERE va.return_date IS NULL ORDER BY va.delivery_date DESC LIMIT 500`).all() as any[];
    if (report === "personnel-assignments") rows = raw.prepare(`SELECT pa.id,pa.assignment_date,p.first_name,p.last_name,p.department,e.equipment_type,e.brand,e.model,e.serial_number,e.asset_tag FROM personnel_assignments pa JOIN personnel p ON p.id=pa.personnel_id JOIN equipment e ON e.id=pa.equipment_id WHERE pa.return_date IS NULL AND pa.status='ACTIVE' ORDER BY pa.assignment_date DESC LIMIT 500`).all() as any[];
    if (report === "active-damage-files") rows = raw.prepare(`SELECT 'ACCIDENT' kind,a.id,a.file_number reference,a.accident_date record_date,a.status,a.actual_cost cost,v.plate FROM vehicle_accidents a JOIN vehicles v ON v.id=a.vehicle_id WHERE a.status NOT IN ('COMPLETED','CLOSED') UNION ALL SELECT 'DAMAGE' kind,d.id,d.damage_type reference,d.damage_date record_date,d.status,d.cost,v.plate FROM vehicle_damages d JOIN vehicles v ON v.id=d.vehicle_id WHERE COALESCE(d.status,'') NOT IN ('COMPLETED','CLOSED') ORDER BY record_date DESC LIMIT 500`).all() as any[];

    if (["vehicle-list", "fleet-vehicles", "owned-vehicles"].includes(report) && rows.length) {
      const ids = rows.map((r: any) => r.id);
      const active = (await db.from("vehicle_assignments").select("vehicle_id").in("vehicle_id", ids).is("return_date", null)).data ?? [];
      const set = new Set(active.map((a: any) => a.vehicle_id));
      rows = rows.map((r: any) => ({ ...r, display_status: r.status === "SERVICE" ? "Serviste" : set.has(r.id) ? "Zimmetli" : uiLabel(r.status, vehicleStatusLabel) }));
    }
  }

  const selectedCostRows=allCosts.filter(r=>r.year===costYear);
  costs={maintenance:selectedCostRows.reduce((s,r)=>s+Number(r.maintenance||0),0),damage:selectedCostRows.reduce((s,r)=>s+Number(r.damage||0),0),fines:selectedCostRows.reduce((s,r)=>s+Number(r.fines||0),0),tires:selectedCostRows.reduce((s,r)=>s+Number(r.tires||0),0),total:selectedCostRows.reduce((s,r)=>s+Number(r.total||0),0)};
  if(report==="vehicle-cost")rows=[{id:"vehicle-cost",...costs}];
  const selected = catalog.find((c) => c.slug === report);
  const term = q.trim().toLocaleLowerCase("tr-TR");
  const visibleCatalog = term ? catalog.filter((c) => [c.name, c.category, c.description].some((v) => String(v || "").toLocaleLowerCase("tr-TR").includes(term))) : catalog;
  const groups = categoryOrder.map((category) => ({ category, items: visibleCatalog.filter((c) => c.category === category) })).filter((g) => g.items.length);
  const uncategorized = visibleCatalog.filter((c) => !categoryOrder.includes(c.category));
  if (uncategorized.length) groups.push({ category: "Diğer Raporlar", items: uncategorized });

  return <>
    <div className="page-head"><div><h1 className="page-title">Raporlar</h1><div className="page-sub">Raporlar net kategoriler altında gruplanır; arama ile ihtiyacınız olan rapora hızlıca ulaşabilirsiniz.</div></div></div>

    <section className="card section"><div className="section-head"><div><div className="section-title">{costYear} Araç Maliyet Özeti</div><div className="page-sub">Maliyetler kayıtların gerçek işlem tarihine göre takvim yılı bazında hesaplanır; geçmiş yıllar silinmez.</div></div></div><div className="section-body"><div className="grid-kpi"><div className="kpi"><div className="kpi-label">Servis / Bakım</div><div className="kpi-value" style={{ fontSize: 22 }}>{formatCurrency(costs.maintenance)}</div></div><div className="kpi"><div className="kpi-label">Kaza / Hasar</div><div className="kpi-value" style={{ fontSize: 22 }}>{formatCurrency(costs.damage)}</div></div><div className="kpi"><div className="kpi-label">Trafik Cezaları</div><div className="kpi-value" style={{ fontSize: 22 }}>{formatCurrency(costs.fines)}</div></div><div className="kpi"><div className="kpi-label">Lastik</div><div className="kpi-value" style={{ fontSize: 22 }}>{formatCurrency(costs.tires)}</div></div><div className="kpi"><div className="kpi-label">Toplam</div><div className="kpi-value" style={{ fontSize: 22 }}>{formatCurrency(costs.total)}</div></div></div></div></section>

    <section className="card section"><div className="section-body"><h2>Yıllık Araç Maliyetleri</h2><div className="page-sub">Yıl seçenekleri mevcut kayıt yılları ve güncel takvim yılına göre otomatik oluşur. Yeni yılda yeni dönem kendiliğinden başlar.</div><form method="get" className="filters"><label htmlFor="cost-year">Yıl</label><select id="cost-year" name="year" className="select" defaultValue={costYear}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select><button className="btn btn-primary">Göster</button></form><CostHistory rows={allCosts.filter(r=>r.year===costYear)}/></div></section>
    <section className="card section report-catalog-shell">
      <div className="section-head"><div><div className="section-title">Rapor Kataloğu</div><div className="page-sub">Kategori seçmek zorunda kalmadan rapor adına veya açıklamasına göre arayabilirsiniz.</div></div></div>
      <div className="section-body">
        <form method="get" action="/raporlar" className="report-search"><input name="q" className="input" defaultValue={q} placeholder="Rapor Ara — örn. ikame, zimmet, ceza..."/><button className="btn btn-primary" type="submit">Ara</button>{q ? <Link className="btn btn-secondary" href="/raporlar">Temizle</Link> : null}</form>
        <div className="report-groups">{groups.map((group) => <section className="report-group" key={group.category}><div className="report-group-title">{group.category}<span>{group.items.length}</span></div><div className="report-catalog">{group.items.map((c: any) => <Link href={`/raporlar?report=${c.slug}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`report-card ${report === c.slug ? "selected" : ""}`} key={c.slug}><div className="report-card-copy"><h3>{c.name}</h3><p>{c.description}</p></div><div className="report-card-actions"><span className="pill gray">{c.report_type}</span><span className="report-open">Aç →</span></div></Link>)}</div></section>)}</div>
        {!visibleCatalog.length ? <div className="empty"><strong>Rapor bulunamadı</strong>“{q}” aramasına uyan rapor bulunmuyor.</div> : null}
        {!catalog.length ? <div className="empty">Rapor kataloğu yüklenemedi. Veritabanı güncellemesini çalıştırın.</div> : null}
      </div>
    </section>

    {selected ? <section className="card section table-wrap"><div className="section-head"><div><div className="section-title">{selected.name}</div><div className="page-sub">{selected.description}</div></div><Link href={q ? `/raporlar?q=${encodeURIComponent(q)}` : "/raporlar"} className="btn btn-secondary">Kataloğa Dön</Link></div>{renderReport(report, rows)}</section> : null}
  </>;
}

function renderReport(report: string, rows: any[]) {
  if (!rows.length) return <div className="empty">Bu rapor için kayıt bulunmuyor.</div>;
  if (report === "vehicle-list") return <table className="table"><thead><tr><th>Plaka</th><th>Mülkiyet</th><th>Marka / Model</th><th>Yıl</th><th>KM</th><th>Sorumlu</th><th>Durum</th><th>Lastik Depo Bayisi</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td><Link href={`/araclar/${r.id}`}><strong>{r.plate}</strong></Link></td><td>{r.ownership_type === "FLEET" ? "Filo" : "Özmal"}</td><td>{r.brand} {r.model}</td><td>{r.model_year}</td><td>{formatNumber(r.current_odometer)}</td><td>{r.responsible_person || "—"}</td><td>{r.display_status || uiLabel(r.status, vehicleStatusLabel)}</td><td>{r.tire_storage_dealer || "—"}</td></tr>)}</tbody></table>;
  if (report === "fleet-vehicles" || report === "owned-vehicles") return <table className="table"><thead><tr><th>Plaka</th><th>Marka / Model</th><th>Sorumlu</th><th>Durum</th>{report === "fleet-vehicles" ? <><th>Sözleşme Bitişi</th><th>Sözleşme KM Limiti</th></> : <th>KM</th>}</tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td><Link href={`/araclar/${r.id}`}><strong>{r.plate}</strong></Link></td><td>{r.brand} {r.model}</td><td>{r.responsible_person || "—"}</td><td>{r.display_status || uiLabel(r.status, vehicleStatusLabel)}</td>{report === "fleet-vehicles" ? <><td>{formatDate(r.contract_end_date)}</td><td>{formatNumber(r.contract_km_limit)}</td></> : <td>{formatNumber(r.current_odometer)}</td>}</tr>)}</tbody></table>;
  if (report === "maintenance") return <table className="table"><thead><tr><th>Tarih</th><th>Araç</th><th>İşlem</th><th>Servis</th><th>Durum</th><th>Maliyet</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{formatDate(r.maintenance_date)}</td><td>{r.vehicles?.plate}</td><td>{r.maintenance_type}</td><td>{r.service_name || "—"}</td><td>{r.status === "PLANNED" ? "Planlandı" : r.status === "IN_SERVICE" ? "Serviste" : r.status === "COMPLETED" ? "Tamamlandı" : r.status === "CANCELLED" ? "İptal" : r.status === "APPOINTMENT_SET" ? "Randevu Alındı" : r.status || "—"}</td><td>{formatCurrency(r.cost)}</td></tr>)}</tbody></table>;
  if (report === "replacement-history") return <table className="table"><thead><tr><th>Araç</th><th>Kaynak</th><th>İkame</th><th>Başlangıç</th><th>İade</th><th>Firma</th><th>Durum</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{r.plate}</td><td>{r.source_type === "SERVICE" ? "Servis" : r.source_type === "DAMAGE" ? "Bağımsız Hasar" : "Kaza / Hasar"}</td><td><strong>{r.replacement_plate}</strong></td><td>{formatDateTime(r.replacement_received_at)}</td><td>{formatDateTime(r.replacement_returned_at)}</td><td>{r.replacement_company || "—"}</td><td><span className={`pill ${r.status === "ACTIVE" ? "blue" : "green"}`}>{r.status === "ACTIVE" ? "Aktif" : "İade Edildi"}</span></td></tr>)}</tbody></table>;
  if (report === "active-vehicle-assignments") return <table className="table"><thead><tr><th>Araç</th><th>Zimmetli Personel</th><th>Teslim Tarihi</th><th>Teslim KM</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td><Link href={`/araclar/${r.vehicle_id}`}><strong>{r.plate}</strong></Link></td><td>{r.assigned_to}</td><td>{formatDateTime(r.delivery_date)}</td><td>{formatNumber(r.delivery_odometer)}</td></tr>)}</tbody></table>;
  if (report === "personnel-assignments") return <table className="table"><thead><tr><th>Personel</th><th>Departman</th><th>Ekipman</th><th>Marka / Model</th><th>Seri / Demirbaş</th><th>Zimmet Tarihi</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td><strong>{r.first_name} {r.last_name}</strong></td><td>{r.department || "—"}</td><td>{r.equipment_type}</td><td>{[r.brand, r.model].filter(Boolean).join(" ") || "—"}</td><td>{r.serial_number || r.asset_tag || "—"}</td><td>{formatDate(r.assignment_date)}</td></tr>)}</tbody></table>;
  if (report === "accident-damage") return <table className="table"><thead><tr><th>Dosya No</th><th>Tarih</th><th>Araç</th><th>Durum</th><th>Maliyet</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td><Link href={`/kaza-hasar/${r.id}`}><strong>{r.file_number}</strong></Link></td><td>{formatDate(r.accident_date)}</td><td>{r.vehicles?.plate}</td><td>{uiLabel(r.status, accidentStatusLabel)}</td><td>{formatCurrency(r.actual_cost)}</td></tr>)}</tbody></table>;
  if (report === "active-damage-files") return <table className="table"><thead><tr><th>Tür</th><th>Referans</th><th>Tarih</th><th>Araç</th><th>Durum</th><th>Maliyet</th></tr></thead><tbody>{rows.map((r) => <tr key={`${r.kind}-${r.id}`}><td>{r.kind === "ACCIDENT" ? "Kaza / Hasar" : "Bağımsız Hasar"}</td><td><Link href={r.kind === "ACCIDENT" ? `/kaza-hasar/${r.id}` : `/kaza-hasar/hasar/${r.id}`}><strong>{r.reference || "Detay"}</strong></Link></td><td>{formatDate(r.record_date)}</td><td>{r.plate}</td><td>{r.status}</td><td>{formatCurrency(r.cost)}</td></tr>)}</tbody></table>;
  if (report === "tire-history") return <><div className="section-body" style={{paddingTop:0}}><Link className="btn btn-secondary" href="/api/tires/export">Excel'e Aktar</Link></div><table className="table"><thead><tr><th>Tarih</th><th>Araç</th><th>KM</th><th>İşlem</th><th>İşlemi Yapan Kişi</th><th>Maliyet</th><th>Açıklama</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{formatDate(r.transaction_date)}{r.transaction_time ? ` ${String(r.transaction_time).slice(0,5)}` : ""}</td><td><Link href={`/araclar/${r.vehicle_id}`}><strong>{r.plate}</strong></Link></td><td>{formatNumber(r.odometer)} KM</td><td>{r.transaction_type}</td><td>{r.performed_by_name || "—"}</td><td>{formatCurrency(r.cost||0)}</td><td>{r.description || "—"}</td></tr>)}</tbody></table></>;
  if (report === "traffic-fines") return <table className="table"><thead><tr><th>Tarih</th><th>Araç</th><th>Sürücü</th><th>Ceza Türü</th><th>Tutar</th><th>Ödeme</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{formatDate(r.fine_date)}</td><td>{r.vehicles?.plate}</td><td>{r.driver || "—"}</td><td>{r.fine_type}</td><td>{formatCurrency(r.amount)}</td><td>{uiLabel(r.payment_status, paymentStatusLabel)}</td></tr>)}</tbody></table>;
  if (report === "vehicle-cost") return <div className="section-body"><div className="grid-kpi"><div className="kpi"><div className="kpi-label">Servis / Bakım</div><div className="kpi-value" style={{ fontSize: 20 }}>{formatCurrency(rows[0].maintenance)}</div></div><div className="kpi"><div className="kpi-label">Kaza / Hasar</div><div className="kpi-value" style={{ fontSize: 20 }}>{formatCurrency(rows[0].damage)}</div></div><div className="kpi"><div className="kpi-label">Trafik Cezaları</div><div className="kpi-value" style={{ fontSize: 20 }}>{formatCurrency(rows[0].fines)}</div></div><div className="kpi"><div className="kpi-label">Lastik</div><div className="kpi-value" style={{ fontSize: 20 }}>{formatCurrency(rows[0].tires)}</div></div><div className="kpi"><div className="kpi-label">Toplam</div><div className="kpi-value" style={{ fontSize: 20 }}>{formatCurrency(rows[0].total)}</div></div></div></div>;
  if (report === "audit-log") return <table className="table"><thead><tr><th>Tarih / Saat</th><th>Kullanıcı</th><th>Modül</th><th>İşlem</th><th>Kayıt</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{formatDateTime(r.created_at)}</td><td>{r.user_name_snapshot || "Sistem"}</td><td>{moduleLabel(r.module)}</td><td>{actionLabel(r.action)}</td><td>{r.entity_reference || "—"}</td></tr>)}</tbody></table>;
  return <div className="empty">Bu raporun detay görünümü hazırlanıyor.</div>;
}
