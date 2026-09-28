import { CaseServicePanel } from "@/components/case-service-panel";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { SubmitButton } from "@/components/submit-button";
import { uploadAttachmentVersion } from "@/lib/attachment-upload";
import { damageStatusLabel, uiLabel } from "@/lib/labels";
import { reconcileVehicleStatus } from "@/lib/vehicle-status";
import { getDatabase } from "@/lib/local/database";
import { ReplacementManager } from "@/components/replacement-manager";
import { manageReplacement } from "@/lib/replacement-vehicles";

export const dynamic = "force-dynamic";
const trNowLocal = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(" ", "T");
export default async function DamageDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string; upload?: string; upload_message?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { db } = await requireUser();
  if (!db) return null;
  const { data: d } = await db.from("vehicle_damages").select("*,vehicles(id,plate,brand,model,status)").eq("id", id).maybeSingle();
  if (!d) notFound();
  const { data: files } = await db.from("attachments").select("id,description,attachment_versions(id,version_number,original_filename,mime_type,file_size,uploaded_at)").eq("entity_type", "vehicle_damage").eq("entity_id", id).eq("is_active", true).order("created_at", { ascending: false });
  const replacementRecords=getDatabase().prepare("SELECT * FROM vehicle_replacement_records WHERE source_type='DAMAGE' AND source_id=? ORDER BY replacement_received_at DESC,created_at DESC").all(id) as any[];
  const replacementUses=getDatabase().prepare("SELECT * FROM vehicle_usage_records WHERE replacement_record_id IN (SELECT id FROM vehicle_replacement_records WHERE source_type='DAMAGE' AND source_id=?) ORDER BY checkout_at DESC").all(id) as any[];
  const maxNow = trNowLocal();
  const canReplacement = d.status === "IN_SERVICE" || d.vehicles?.status === "SERVICE";

  async function closeDamage() {
    "use server";
    const { db, user } = await requireUser();
    if (!db || !user) return;
    const raw=getDatabase();
    if(raw.prepare("SELECT 1 FROM case_services WHERE source_type='DAMAGE' AND source_id=? AND exit_at IS NULL").get(id)) redirect(`/kaza-hasar/hasar/${id}?error=${encodeURIComponent("Aktif servis süreci tamamlanmadan hasar dosyası kapatılamaz.")}`);
    const activeReplacement=raw.prepare("SELECT replacement_plate FROM vehicle_replacement_records WHERE source_type='DAMAGE' AND source_id=? AND status='ACTIVE' LIMIT 1").get(id) as any;
    if(activeReplacement)redirect(`/kaza-hasar/hasar/${id}?error=${encodeURIComponent(`Aktif ikame araç bulunmaktadır: ${activeReplacement.replacement_plate}. Öncelikle ikame araç iade işlemini tamamlayınız.`)}`);
    const {error}=await db.from("vehicle_damages").update({ status: "CLOSED" }).eq("id", id);
    if(error) redirect(`/kaza-hasar/hasar/${id}?error=${encodeURIComponent(error.message)}`);
    await reconcileVehicleStatus(db, d.vehicle_id, user.id);
    revalidatePath(`/kaza-hasar/hasar/${id}`); revalidatePath(`/araclar/${d.vehicle_id}`); revalidatePath("/kaza-hasar"); revalidatePath("/ana-panel");
    redirect(`/kaza-hasar/hasar/${id}?saved=1`);
  }

  async function replacementAction(fd: FormData) {
    "use server";
    const { user } = await requireUser();
    if (!user) return;
    try { manageReplacement({sourceType:"DAMAGE",sourceId:id,vehicleId:d.vehicle_id,user},fd); }
    catch(e:any){ redirect(`/kaza-hasar/hasar/${id}?error=${encodeURIComponent(String(e?.message||"İkame araç işlemi tamamlanamadı."))}`); }
    revalidatePath(`/kaza-hasar/hasar/${id}`); revalidatePath(`/araclar/${d.vehicle_id}`); revalidatePath("/araclar"); revalidatePath("/arama");
    redirect(`/kaza-hasar/hasar/${id}?saved=1`);
  }

  async function uploadFiles(fd: FormData) {
    "use server";
    const { db, user } = await requireUser();
    if (!db || !user) return;
    const uploads = fd.getAll("files").filter((x): x is File => x instanceof File && x.size > 0);
    if (!uploads.length) redirect(`/kaza-hasar/hasar/${id}?error=${encodeURIComponent("Dosya seçin.")}`);
    try {
      for (const file of uploads) {
        if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type)) throw new Error("Sadece PDF, JPG, JPEG veya PNG yüklenebilir.");
        await uploadAttachmentVersion({ db, userId: user.id, file, entityType: "vehicle_damage", entityId: id, description: file.type === "application/pdf" ? "Hasar belgesi" : "Hasar görseli" });
      }
    } catch (e: any) {
      redirect(`/kaza-hasar/hasar/${id}?error=${encodeURIComponent(String(e?.message || "Dosya yüklenemedi."))}`);
    }
    revalidatePath(`/kaza-hasar/hasar/${id}`);
    redirect(`/kaza-hasar/hasar/${id}?saved=1`);
  }

  const latest = (files ?? []).flatMap((a: any) => (a.attachment_versions ?? []).sort((x: any, y: any) => y.version_number - x.version_number).slice(0, 1));
  const images = latest.filter((v: any) => String(v.mime_type || "").startsWith("image/"));
  const documents = latest.filter((v: any) => !String(v.mime_type || "").startsWith("image/"));

  return <>
    <div className="page-head"><div><Link href="/kaza-hasar" className="page-sub">← Kaza / Hasar</Link><h1 className="page-title" style={{ marginTop: 6 }}>{d.vehicles?.plate} — Hasar Detayı</h1><div className="page-sub">{formatDate(d.damage_date)} • {d.damage_type} • {d.damaged_area || "Hasarlı bölüm belirtilmedi"}</div></div><Link href={`/araclar/${d.vehicle_id}/gecmis`} className="btn btn-secondary">Araç Geçmişi</Link></div>
    {sp.saved ? <div className="success-box">Değişiklikler kaydedildi.</div> : null}
    {sp.error ? <div className="error-box">{decodeURIComponent(sp.error)}</div> : null}

    <CaseServicePanel kind="DAMAGE" sourceId={id} vehicleId={d.vehicle_id}/>
    <div className="two-col section">
      <section className="card"><div className="section-head"><div className="section-title">Hasar Bilgileri</div></div><div className="section-body"><div className="damage-summary"><div className="kpi"><div className="kpi-label">Hasarlı Bölüm</div><div className="kpi-value" style={{ fontSize: 18 }}>{d.damaged_area || "—"}</div></div><div className="kpi"><div className="kpi-label">Durum</div><span className={`pill ${d.status === "IN_SERVICE" ? "orange" : ["COMPLETED","CLOSED"].includes(d.status) ? "green" : "blue"}`}>{uiLabel(d.status, damageStatusLabel)}</span></div></div><div className="damage-description"><h3>Açıklama</h3><p>{d.description || "Açıklama yok."}</p></div><div className="form-actions">{!["COMPLETED", "CLOSED"].includes(d.status) ? <form action={closeDamage}><SubmitButton className="btn btn-secondary">Dosyayı Kapat</SubmitButton></form> : null}</div></div></section>


    </div>

    <ReplacementManager records={replacementRecords} uses={replacementUses} action={replacementAction} canCreate={canReplacement} nowLocal={maxNow} title="İkame Araç Yönetimi"/>

    <section className="card section"><div className="section-head"><div><div className="section-title">Hasar Belgeleri</div><div className="page-sub">PDF ve görseller kayıtla birlikte kalıcı olarak saklanır.</div></div></div><div className="section-body"><form action={uploadFiles}><div className="field"><label>Yeni Dosyalar</label><input name="files" type="file" multiple accept="application/pdf,image/jpeg,image/png" className="input" required /><small>PDF, JPG, JPEG veya PNG.</small></div><div className="form-actions"><SubmitButton>Dosyaları Yükle</SubmitButton></div></form>
      {images.length ? <div className="damage-gallery section">{images.map((v: any) => <a key={v.id} href={`/api/attachments/version/${v.id}`} target="_blank" className="damage-image-card"><img src={`/api/attachments/version/${v.id}`} alt={v.original_filename} /><span>{v.original_filename}</span></a>)}</div> : null}
      {documents.length ? <div className="section">{documents.map((v: any) => <div className="alert-row" key={v.id}><div><strong>{v.original_filename}</strong><div className="page-sub">PDF belge • {Math.ceil(Number(v.file_size || 0) / 1024)} KB</div></div><div style={{ display: "flex", gap: 8 }}><a className="btn btn-secondary" href={`/api/attachments/version/${v.id}`} target="_blank">Görüntüle</a><a className="btn btn-secondary" href={`/api/attachments/version/${v.id}?download=1`}>İndir</a></div></div>)}</div> : null}
      {!latest.length ? <div className="empty">Henüz hasar belgesi veya görseli yok.</div> : null}
    </div></section>

  </>;
}
