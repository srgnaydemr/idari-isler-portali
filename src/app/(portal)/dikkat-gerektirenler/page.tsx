import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { notificationSeverityLabel, uiLabel } from "@/lib/labels";
import { getDatabase } from "@/lib/local/database";

function severityPill(severity: string) {
  if (severity === "CRITICAL") return "red";
  if (severity === "HIGH" || severity === "MEDIUM") return "orange";
  return "blue";
}

export default async function AttentionPage() {
  const { db } = await requireUser();
  const sql=getDatabase();
  let rows: any[] = [];
  if (db) {
    const r = await db.from("attention_required").select("alert_key,title,message,severity,severity_rank,entity_type,entity_id,due_date,notification_type").order("severity_rank", { ascending: false }).order("due_date", { ascending: true, nullsFirst: false }).limit(200);
    rows = r.data ?? [];
  }
  return <>
    <div className="page-head"><div><h1 className="page-title">Dikkat Gerektirenler</h1><div className="page-sub">Ana Panel ile aynı canlı veri kaynağından gelen kritik ve yaklaşan kayıtlar</div></div></div>
    <section className="card"><div className="section-body"><div className="alerts">{rows.map(r => {
      const fineVehicle=r.entity_type === "traffic_fine" ? (sql.prepare("SELECT vehicle_id FROM vehicle_traffic_fines WHERE id=?").get(r.entity_id) as any)?.vehicle_id : null;
      const contractVehicle=r.entity_type === "rental_contract" ? (sql.prepare("SELECT vehicle_id FROM vehicle_rental_contracts WHERE id=?").get(r.entity_id) as any)?.vehicle_id : null;
      const href = r.entity_type === "vehicle" ? `/araclar/${r.entity_id}` : r.entity_type === "traffic_fine" && fineVehicle ? `/araclar/${fineVehicle}/dosyalar` : r.entity_type === "task" ? "/gorevler" : r.entity_type === "rental_contract" && contractVehicle ? `/araclar/${contractVehicle}/genel` : "/dikkat-gerektirenler";
      return <Link href={href} className="alert-row" key={r.alert_key}><div className="alert-main"><span className={`dot ${severityPill(r.severity)}`} /><div><strong>{r.title}</strong><div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{r.message}</div>{r.due_date ? <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>Tarih: {formatDate(r.due_date)}</div> : null}</div></div><span className={`pill ${severityPill(r.severity)}`}>{uiLabel(r.severity, notificationSeverityLabel)}</span></Link>;
    })}{!rows.length ? <div className="empty">Şu anda gösterilecek kritik uyarı bulunmuyor.</div> : null}</div></div></section>
  </>;
}
