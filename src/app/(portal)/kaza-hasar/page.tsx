import { DamageVehicleFields } from "@/components/damage-vehicle-fields";
import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { SubmitButton } from "@/components/submit-button";
import { accidentStatusLabel, damageStatusLabel, uiLabel } from "@/lib/labels";
import { reconcileVehicleStatus } from "@/lib/vehicle-status";
import { uploadAttachmentVersion } from "@/lib/attachment-upload";
import { getDatabase } from "@/lib/local/database";

function revalidateVehicleViews(vehicleId: string) {
  revalidatePath("/kaza-hasar");
  revalidatePath("/araclar");
  revalidatePath(`/araclar/${vehicleId}`);
  revalidatePath("/ana-panel");
  revalidatePath("/dikkat-gerektirenler");
}

export default async function Accidents({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const sp=await searchParams;
  const { db } = await requireUser();
  const today = new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  let vehicles: any[] = [];
  let accidents: any[] = [];
  let damages: any[] = [];

  if (db) {
    const [v, a, d] = await Promise.all([
      db.from("vehicles").select("id,plate,current_odometer").eq("is_active", true).order("plate"),
      db.from("vehicle_accidents").select("id,vehicle_id,file_number,accident_date,driver,accident_location,status,actual_cost,vehicles(plate)").order("accident_date", { ascending: false }).limit(80),
      db.from("vehicle_damages").select("id,vehicle_id,damage_date,damage_type,damaged_area,description,status,cost,replacement_plate,vehicles(plate)").order("damage_date", { ascending: false }).limit(80),
    ]);
    vehicles = v.data ?? [];
    accidents = a.data ?? [];
    damages = d.data ?? [];
    const replacements=getDatabase().prepare("SELECT source_id,replacement_plate,replacement_returned_at,status,created_at FROM vehicle_replacement_records WHERE source_type='ACCIDENT' ORDER BY CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END,COALESCE(replacement_received_at,created_at) DESC,created_at DESC").all() as any[];
    const replacementMap=new Map<string,any>(); for(const x of replacements) if(!replacementMap.has(String(x.source_id))) replacementMap.set(String(x.source_id),x);
    accidents=accidents.map(x=>({...x,replacement_plate:replacementMap.get(x.id)?.replacement_plate||null,replacement_returned_at:replacementMap.get(x.id)?.replacement_returned_at||null}));
  }

  async function addAccident(fd: FormData) {
    "use server";
    const { db, user } = await requireUser();
    if (!db || !user) return;
    const vehicleId = String(fd.get("vehicle_id"));
    const { error } = await db.from("vehicle_accidents").insert({
      vehicle_id: vehicleId,
      accident_date: String(fd.get("accident_date")),
      accident_time: String(fd.get("accident_time") || "") || null,
      driver: String(fd.get("driver") || "") || null,
      accident_location: String(fd.get("accident_location") || "") || null,
      counterparty_plate: String(fd.get("counterparty_plate") || "") || null,
      description: String(fd.get("description") || "") || null,
      damage_description: String(fd.get("damage_description") || "") || null,
      status: "NEW",
      estimated_cost: Number(fd.get("estimated_cost") || 0),
      created_by: user.id,
    });
    if (error) throw new Error("Kaza dosyası oluşturulamadı.");
    await reconcileVehicleStatus(db,vehicleId,user.id);
    const vehicleError=null;
    if (vehicleError) throw new Error("Kaza kaydedildi ancak araç durumu Hasarlı olarak güncellenemedi.");
    revalidateVehicleViews(vehicleId);
  }

  async function addDamage(fd: FormData) {
    "use server";
    const { db, user } = await requireUser();
    if (!db || !user) return;
    const vehicleId = String(fd.get("d_vehicle_id"));
    const uploads=fd.getAll("images").filter((x):x is File=>x instanceof File&&x.size>0);
    for(const file of uploads){if(!["image/jpeg","image/png","application/pdf"].includes(file.type))throw new Error("Hasar belgeleri PDF, JPG, JPEG veya PNG olmalıdır.");}
    const { data: damage, error } = await db.from("vehicle_damages").insert({
      vehicle_id: vehicleId,
      damage_date: String(fd.get("damage_date")),
      odometer: fd.get("odometer") === "" || fd.get("odometer") == null ? null : Number(fd.get("odometer")),
      damage_type: String(fd.get("damage_type")),
      damaged_area: String(fd.get("damaged_area") || "") || null,
      description: String(fd.get("d_description") || "") || null,
      cost: Number(fd.get("cost") || 0),
      status: "NEW",
      created_by: user.id,
    }).select("id").single();
    if (error || !damage) redirect(`/kaza-hasar?error=${encodeURIComponent(error?.message || "Hasar kaydı oluşturulamadı.")}`);
    for(const file of uploads){await uploadAttachmentVersion({db,userId:user.id,file,entityType:"vehicle_damage",entityId:damage.id,description:file.type==="application/pdf"?"Hasar belgesi":"Hasar görseli"});}
    await reconcileVehicleStatus(db,vehicleId,user.id);
    const vehicleError=null;
    if (vehicleError) throw new Error("Hasar kaydedildi ancak araç durumu Hasarlı olarak güncellenemedi.");
    revalidateVehicleViews(vehicleId);
  }

  return <>
    {sp.error && <div className="error-box">{sp.error}</div>}
    <div className="page-head"><div><h1 className="page-title">Kaza / Hasar</h1><div className="page-sub">Kaza dosyaları ve kazadan bağımsız araç hasarları</div></div></div>

    <div className="two-col">
      <form action={addAccident} className="card">
        <div className="section-head"><div className="section-title">Yeni Kaza Kaydı</div></div>
        <div className="section-body"><div className="form-grid">
          <div className="field"><label>Araç *</label><select name="vehicle_id" className="select" required><option value="">Seçiniz</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}</select></div>
          <div className="field"><label>Kaza Tarihi *</label><input name="accident_date" type="date" max={today} className="input" required /></div>
          <div className="field"><label>Kaza Saati</label><input name="accident_time" type="time" className="input" /></div>
          <div className="field"><label>Sürücü</label><input name="driver" className="input" /></div>
          <div className="field"><label>Kaza Yeri</label><input name="accident_location" className="input" /></div>
          <div className="field"><label>Karşı Araç Plakası</label><input name="counterparty_plate" className="input" /></div>
          <div className="field"><label>Tahmini Maliyet</label><input name="estimated_cost" type="number" min="0" step="0.01" className="input" /></div>
          <div className="field" style={{ gridColumn: "1/-1" }}><label>Kaza Açıklaması</label><textarea name="description" className="textarea" rows={2} /></div>
          <div className="field" style={{ gridColumn: "1/-1" }}><label>Hasar Açıklaması</label><textarea name="damage_description" className="textarea" rows={2} /></div>
        </div><div className="form-actions"><SubmitButton>Kaza Dosyası Aç</SubmitButton></div></div>
      </form>

      <form action={addDamage} className="card">
        <div className="section-head"><div className="section-title">Bağımsız Hasar Kaydı</div></div>
        <div className="section-body">
          <DamageVehicleFields vehicles={vehicles.map(v=>({id:v.id,plate:v.plate,current_odometer:v.current_odometer}))}/>
          <div className="field" style={{ marginTop: 10 }}><label>Tarih *</label><input name="damage_date" type="date" max={today} className="input" required /></div>
          <div className="field" style={{ marginTop: 10 }}><label>Hasar Türü *</label><input name="damage_type" className="input" required placeholder="Çizik, göçük, cam..." /></div><div className="field" style={{ marginTop: 10 }}><label>Hasarlı Bölüm</label><input name="damaged_area" className="input" placeholder="Sol ön kapı, arka tampon..." /></div>
          <div className="field" style={{ marginTop: 10 }}><label>Maliyet</label><input name="cost" type="number" min="0" step="0.01" className="input" /></div>
          <div className="field" style={{ marginTop: 10 }}><label>Açıklama</label><textarea name="d_description" className="textarea" rows={3} /></div><div className="field" style={{ marginTop: 10 }}><label>Hasar Belgeleri / Görselleri</label><input type="file" name="images" className="input" accept="application/pdf,image/jpeg,image/png" multiple/><small>Birden fazla PDF / JPG / JPEG / PNG seçebilirsiniz.</small></div>
          <div className="form-actions"><SubmitButton>Hasar Kaydet</SubmitButton></div>
        </div>
      </form>
    </div>

    <section className="card section table-wrap">
      <div className="section-head"><div className="section-title">Kazalar</div></div>
      <table className="table"><thead><tr><th>Dosya No</th><th>Tarih</th><th>Araç</th><th>Sürücü</th><th>Yer</th><th>İkame Araç</th><th>Durum</th><th>Maliyet</th></tr></thead><tbody>{accidents.map((r: any) => <tr key={r.id}><td><Link href={`/kaza-hasar/${r.id}`} style={{ fontWeight: 800, color: "#163a5f" }}>{r.file_number}</Link></td><td>{formatDate(r.accident_date)}</td><td>{r.vehicles?.plate}</td><td>{r.driver || "—"}</td><td>{r.accident_location || "—"}</td><td>{r.replacement_plate||"—"}</td><td>{uiLabel(r.status, accidentStatusLabel)}</td><td>{formatCurrency(r.actual_cost)}</td></tr>)}</tbody></table>
      {!accidents.length ? <div className="empty">Henüz kaza kaydı bulunmuyor.</div> : null}
    </section>

    <section className="card section table-wrap">
      <div className="section-head"><div className="section-title">Hasarlar</div></div>
      <table className="table"><thead><tr><th>Tarih</th><th>Araç</th><th>Hasar Türü</th><th>Hasarlı Bölüm</th><th>İkame</th><th>Açıklama</th><th>Durum</th><th>Maliyet</th><th>Durumu Güncelle</th></tr></thead><tbody>{damages.map((r: any) => <tr key={r.id}>
        <td>{formatDate(r.damage_date)}</td><td><Link href={`/kaza-hasar/hasar/${r.id}`} style={{fontWeight:800,color:"#163a5f"}}>{r.vehicles?.plate}</Link></td><td>{r.damage_type}</td><td>{r.damaged_area||"—"}</td><td>{r.replacement_plate||"—"}</td><td>{r.description || "—"}</td><td>{uiLabel(r.status, damageStatusLabel)}</td><td>{formatCurrency(r.cost)}</td>
        <td><Link className="btn btn-secondary" href={`/kaza-hasar/hasar/${r.id}`}>Detay / Servis Süreci</Link></td>
      </tr>)}</tbody></table>
      {!damages.length ? <div className="empty">Henüz bağımsız hasar kaydı bulunmuyor.</div> : null}
    </section>
  </>;
}
