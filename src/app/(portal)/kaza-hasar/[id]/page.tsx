import { CaseServicePanel } from "@/components/case-service-panel";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/local/database";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { SubmitButton } from "@/components/submit-button";
import { accidentStatusLabel, uiLabel } from "@/lib/labels";
import { reconcileVehicleStatus } from "@/lib/vehicle-status";
import { ReplacementManager } from "@/components/replacement-manager";
import { manageReplacement } from "@/lib/replacement-vehicles";

export const dynamic = "force-dynamic";
const trNowLocal = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(" ", "T");

export default async function AccidentDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string; upload?: string; upload_message?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { db } = await requireUser();
  if (!db) return null;
  const { data: a } = await db.from("vehicle_accidents").select("*,vehicles(id,plate,brand,model,status)").eq("id", id).maybeSingle();
  if (!a) notFound();
  const [u, att, rr] = await Promise.all([
    db.from("vehicle_accident_updates").select("id,note,created_at,users(first_name,last_name)").eq("accident_id", id).order("created_at", { ascending: false }),
    db.from("attachments").select("id,description,created_at,attachment_versions(id,version_number,original_filename,mime_type,file_size,uploaded_at)").eq("entity_type", "accident").eq("entity_id", id).eq("is_active", true).order("created_at", { ascending: false }),
    db.from("vehicle_replacement_records").select("*").eq("source_type", "ACCIDENT").eq("source_id", id).order("replacement_received_at", { ascending: false }),
  ]);
  const replacementRecords: any[] = (rr.data ?? []) as any[];
  const replacementUses = getDatabase().prepare("SELECT * FROM vehicle_usage_records WHERE replacement_record_id IN (SELECT id FROM vehicle_replacement_records WHERE source_type='ACCIDENT' AND source_id=?) ORDER BY checkout_at DESC").all(id) as any[];
  const canReplacement = a.status === "IN_SERVICE" || a.vehicles?.status === "SERVICE";
  const maxNow = trNowLocal();

  async function addUpdate(fd: FormData) {
    "use server";
    const { db, user } = await requireUser();
    if (!db || !user) return;
    const note = String(fd.get("note") || "").trim();
    if (note) await db.from("vehicle_accident_updates").insert({ accident_id: id, note, created_by: user.id });
    revalidatePath(`/kaza-hasar/${id}`);
  }

  async function updateCase(fd: FormData) {
    "use server";
    const { db, user } = await requireUser();
    if (!db || !user) return;
    const nextStatus = String(fd.get("status"));
    if (nextStatus === "IN_SERVICE") {
      const openService = await db.from("vehicle_service_records").select("id").eq("vehicle_id", a.vehicle_id).eq("status", "OPEN").limit(1).maybeSingle();
      if (openService.data) redirect(`/kaza-hasar/${id}?error=${encodeURIComponent("Bu aracın Servis / İkame bölümünde açık servis kaydı bulunmaktadır. Mevcut servis tamamlanmadan Kaza / Hasar kaydı Serviste durumuna alınamaz.")}`);
    }
    if (["COMPLETED","CLOSED"].includes(nextStatus)) {
      const raw=getDatabase();
      const openCase = raw.prepare("SELECT 1 FROM case_services WHERE source_type='ACCIDENT' AND source_id=? AND exit_at IS NULL").get(id);
      if (openCase) redirect(`/kaza-hasar/${id}?error=${encodeURIComponent("Aktif servis süreci tamamlanmadan kaza dosyası kapatılamaz.")}`);
      const activeReplacement=raw.prepare("SELECT replacement_plate FROM vehicle_replacement_records WHERE source_type='ACCIDENT' AND source_id=? AND status='ACTIVE' LIMIT 1").get(id) as any;
      if(activeReplacement)redirect(`/kaza-hasar/${id}?error=${encodeURIComponent(`Aktif ikame araç bulunmaktadır: ${activeReplacement.replacement_plate}. Öncelikle ikame araç iade işlemini tamamlayınız.`)}`);
    }
    const { error } = await db.from("vehicle_accidents").update({
      status: nextStatus,
      insurance_company: String(fd.get("insurance_company") || "") || null,
      insurance_claim_number: String(fd.get("insurance_claim_number") || "") || null,
      expert_info: String(fd.get("expert_info") || "") || null,
      fault_rate: Number(fd.get("fault_rate") || 0) || null,
      actual_cost: Number(fd.get("actual_cost") || 0),
      notes: String(fd.get("notes") || "") || null,
    }).eq("id", id);
    if (error) redirect(`/kaza-hasar/${id}?error=${encodeURIComponent(error.message)}`);
    await reconcileVehicleStatus(db, a.vehicle_id, user.id);
    revalidatePath(`/kaza-hasar/${id}`); revalidatePath("/kaza-hasar"); revalidatePath(`/araclar/${a.vehicle_id}`); revalidatePath("/araclar"); revalidatePath("/ana-panel");
  }

  async function replacementAction(fd: FormData) {
    "use server";
    const { user } = await requireUser();
    if (!user) return;
    try { manageReplacement({sourceType:"ACCIDENT",sourceId:id,vehicleId:a.vehicle_id,user},fd); }
    catch(e:any){ redirect(`/kaza-hasar/${id}?error=${encodeURIComponent(String(e?.message||"İkame araç işlemi tamamlanamadı."))}`); }
    revalidatePath(`/kaza-hasar/${id}`); revalidatePath(`/araclar/${a.vehicle_id}`); revalidatePath("/araclar"); revalidatePath("/arama");
    redirect(`/kaza-hasar/${id}?saved=1`);
  }

  return <>
    <div className="page-head"><div><Link href="/kaza-hasar" className="page-sub">← Kaza / Hasar</Link><h1 className="page-title" style={{ marginTop: 6 }}>{a.file_number}</h1><div className="page-sub">{a.vehicles?.plate} • {formatDate(a.accident_date)} • {a.accident_location || "Konum belirtilmedi"}</div></div><span className="pill orange">{uiLabel(a.status, accidentStatusLabel)}</span></div>
    {sp.saved ? <div className="success-box">Değişiklikler kaydedildi.</div> : null}{sp.error ? <div className="error-box">{decodeURIComponent(sp.error)}</div> : null}{sp.upload === "error" ? <div className="error-box">{sp.upload_message || "Dosya yüklenemedi."}</div> : null}

    <div className="grid-kpi"><div className="card kpi"><div className="kpi-label">Araç</div><div className="kpi-value" style={{ fontSize: 20 }}>{a.vehicles?.plate}</div></div><div className="card kpi"><div className="kpi-label">Sürücü</div><div className="kpi-value" style={{ fontSize: 20 }}>{a.driver || "—"}</div></div><div className="card kpi"><div className="kpi-label">Tahmini Maliyet</div><div className="kpi-value" style={{ fontSize: 20 }}>{formatCurrency(a.estimated_cost)}</div></div><div className="card kpi"><div className="kpi-label">Gerçekleşen Maliyet</div><div className="kpi-value" style={{ fontSize: 20 }}>{formatCurrency(a.actual_cost)}</div></div></div>

    <section className="card section"><div className="section-body"><div className="damage-summary"><div><div className="kpi-label">Hasarlı Bölüm / Hasar</div><strong>{a.damage_description||"Belirtilmedi"}</strong></div><div><div className="kpi-label">Durum</div><span className={`pill ${a.status==="IN_SERVICE"?"orange":["COMPLETED","CLOSED"].includes(a.status)?"green":"blue"}`}>{uiLabel(a.status,accidentStatusLabel)}</span></div></div><div className="damage-description"><h3>Açıklama</h3><p>{a.description||"Açıklama yok."}</p></div></div></section>
    <CaseServicePanel kind="ACCIDENT" sourceId={id} vehicleId={a.vehicle_id}/>
    <div className="two-col section">
      <form action={updateCase} className="card"><div className="section-head"><div className="section-title">Dosya Bilgileri</div></div><div className="section-body"><div className="form-grid"><div className="field"><label>Durum</label><select name="status" className="select" defaultValue={a.status}><option value="NEW">Yeni</option><option value="DOCUMENTS_PENDING">Evrak Bekleniyor</option><option value="EXPERT_PENDING">Eksper Bekleniyor</option>{a.status === "IN_SERVICE" ? <option value="IN_SERVICE">Serviste</option> : null}<option value="INSURANCE_PROCESS">Sigorta Sürecinde</option><option value="COMPLETED">Tamamlandı</option><option value="CLOSED">Kapandı</option></select></div><div className="field"><label>Kusur Oranı %</label><input name="fault_rate" type="number" min="0" max="100" step="0.01" className="input" defaultValue={a.fault_rate ?? ""} /></div><div className="field"><label>Sigorta Şirketi</label><input name="insurance_company" className="input" defaultValue={a.insurance_company ?? ""} /></div><div className="field"><label>Hasar Dosya No</label><input name="insurance_claim_number" className="input" defaultValue={a.insurance_claim_number ?? ""} /></div><div className="field"><label>Eksper</label><input name="expert_info" className="input" defaultValue={a.expert_info ?? ""} /></div><div className="field"><label>Gerçekleşen Maliyet</label><input name="actual_cost" type="number" min="0" step="0.01" className="input" defaultValue={a.actual_cost ?? 0} /></div><div className="field" style={{ gridColumn: "1/-1" }}><label>Not</label><textarea name="notes" className="textarea" rows={3} defaultValue={a.notes ?? ""} /></div></div><div className="form-actions"><SubmitButton>Dosyayı Güncelle</SubmitButton></div></div></form>
      <section className="card"><div className="section-head"><div className="section-title">Gelişme Notları</div></div><div className="section-body"><form action={addUpdate} style={{ display: "flex", gap: 8, marginBottom: 14 }}><input name="note" className="input" placeholder="Servis ile görüşüldü..." required /><SubmitButton>Not Ekle</SubmitButton></form><div className="timeline">{(u.data ?? []).map((x: any) => <div className="timeline-row" key={x.id}><div className="timeline-date">{formatDateTime(x.created_at)}</div><div className="timeline-line" /><div className="timeline-content"><strong>{[x.users?.first_name, x.users?.last_name].filter(Boolean).join(" ") || "Kullanıcı"}</strong><span>{x.note}</span></div></div>)}{!(u.data ?? []).length ? <div className="empty">Henüz gelişme notu yok.</div> : null}</div></div></section>
    </div>

    <ReplacementManager records={replacementRecords} uses={replacementUses} action={replacementAction} canCreate={canReplacement} nowLocal={maxNow} title="İkame Araç Yönetimi"/>

    <section className="card section"><div className="section-head"><div className="section-title">Kaza Belgeleri</div></div><div className="section-body"><form action="/api/attachments" method="post" encType="multipart/form-data" className="form-grid"><input type="hidden" name="entity_type" value="accident" /><input type="hidden" name="entity_id" value={id} /><input type="hidden" name="return_to" value={`/kaza-hasar/${id}`} /><div className="field"><label>Dosya *</label><input type="file" name="file" className="input" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" required /></div><div className="field"><label>Açıklama</label><input name="description" className="input" placeholder="Kaza tespit tutanağı..." /></div><div className="form-actions" style={{ gridColumn: "1/-1" }}><SubmitButton>Dosya Yükle</SubmitButton></div></form><div className="section" style={{ marginTop: 18 }}>{(att.data ?? []).map((x: any) => <div className="alert-row" key={x.id}><div><strong>{x.description || "Belge"}</strong><div className="page-sub">{(x.attachment_versions ?? []).length} sürüm</div></div><div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>{(x.attachment_versions ?? []).sort((aa: any, bb: any) => bb.version_number - aa.version_number).map((v: any) => <span key={v.id} style={{ display: "inline-flex", gap: 4 }}><span className="page-sub">{v.original_filename}</span><a className="btn btn-secondary" href={`/api/attachments/version/${v.id}`} target="_blank">Görüntüle</a><a className="btn btn-secondary" href={`/api/attachments/version/${v.id}?download=1`}>İndir</a></span>)}<form action="/api/attachments" method="post" encType="multipart/form-data" style={{ display: "flex", gap: 6 }}><input type="hidden" name="entity_type" value="accident" /><input type="hidden" name="entity_id" value={id} /><input type="hidden" name="attachment_id" value={x.id} /><input type="hidden" name="return_to" value={`/kaza-hasar/${id}`} /><input type="file" name="file" className="input" style={{ maxWidth: 240 }} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" required /><button type="submit" className="btn btn-secondary">Yeni Sürüm</button></form></div></div>)}{!(att.data ?? []).length ? <div className="empty">Henüz belge yüklenmedi.</div> : null}</div></div></section>
  </>;
}
