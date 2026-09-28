import {personnelLabel} from "@/lib/search";
import {PersonnelSnapshot} from "@/components/personnel-snapshot";
import {VehicleCaseServices} from "@/components/vehicle-case-services";
import {annualCosts,currentYear} from "@/lib/annual-costs";
import {CostHistory} from "@/components/cost-history";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { OdometerForm } from "./odometer-form";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { accidentStatusLabel, damageStatusLabel, documentTypeLabel, paymentStatusLabel, tireTransactionLabel, uiLabel, vehicleStatusLabel } from "@/lib/labels";
import { vehicleOperationalStatus } from "@/lib/vehicle-operational-status";
import { uploadAttachmentVersion } from "@/lib/attachment-upload";
import { getDatabase } from "@/lib/local/database";
import { updateVehicleGeneralRecord, vehicleUpdateErrorMessage } from "@/lib/vehicle-general-store";
import { contractDurationText } from "@/lib/rental-contracts";
import { ReplacementManager } from "@/components/replacement-manager";
import { manageReplacement } from "@/lib/replacement-vehicles";

const tabs = [
  ["general", "Genel Bilgiler"],
  ["assignment", "Zimmet"],
  ["service", "Servis / İkame"],
  ["tracking", "Süre Takibi"],
  ["files", "Dosyalar"],
  ["history", "Geçmiş"],
] as const;

function normalizeTab(tab?: string) {
  if (!tab) return "general";
  if (["timeline", "audit", "odometer", "accidents", "damages", "tires"].includes(tab)) return "history";
  if (["maintenance"].includes(tab)) return "service";
  if (["assignments"].includes(tab)) return "assignment";
  if (["documents", "fines"].includes(tab)) return "files";
  if (["compliance", "inspection", "parking"].includes(tab)) return "tracking";
  return tabs.some(([key]) => key === tab) ? tab : "general";
}

function serviceState(status: string) {
  if (status === "OPEN") return { label: "Serviste", pill: "blue" };
  if (status === "CLOSED") return { label: "Tamamlandı", pill: "green" };
  return { label: "İptal", pill: "gray" };
}
function remainingText(endDate: string | null | undefined, today: string) {
  if(!endDate)return "—";
  const diff=Math.round((new Date(String(endDate).slice(0,10)+"T00:00:00Z").getTime()-new Date(today+"T00:00:00Z").getTime())/86400000);
  if(diff<0)return `${Math.abs(diff)} Gün Geçti`;
  if(diff===0)return "Bugün";
  return `${diff} Gün`;
}

function errMessage(message: string) {
  if (message.includes("VEHICLE_IN_SERVICE")) return "Araç servisteyken yeni zimmet oluşturulamaz.";
  if (message.includes("VEHICLE_NOT_AVAILABLE")) return "Araç şu anda zimmet için uygun durumda değil.";
  if (message.includes("ACTIVE_ASSIGNMENT_EXISTS")) return "Bu aracın zaten aktif bir zimmeti bulunuyor.";
  if (message.includes("FUTURE_ASSIGNMENT_DATETIME")) return "Lütfen geçerli bir tarih ve saat giriniz. Zimmet tarihi ve saati mevcut tarih ve saatten ileri olamaz.";
  if (message.includes("FUTURE_RETURN_DATETIME")) return "İade tarihi ve saati mevcut tarih ve saatten ileri olamaz.";
  if (message.includes("RETURN_ODOMETER_BELOW_ASSIGNMENT")) return "İade kilometresi, aracın zimmet başlangıç kilometresinden düşük olamaz.";
  if (message.includes("RETURN_ODOMETER_BELOW_CURRENT")) return "İade kilometresi aracın güncel kilometresinden düşük olamaz.";
  if (message.includes("OPEN_SERVICE_EXISTS")) return "Bu aracın zaten açık bir servis kaydı bulunuyor.";
  if (message.includes("ACTIVE_DAMAGE_SERVICE_CONFLICT")) return "Bu araç Kaza / Hasar bölümünde aktif bir servis sürecindedir. Mevcut Kaza / Hasar kaydı tamamlanmadan veya kapatılmadan yeni Servis / İkame kaydı oluşturulamaz.";
  if (message.includes("ACTIVE_REPLACEMENT_EXISTS")) return "Bu araç için başka bir aktif ikame kaydı bulunmaktadır. Mevcut ikame iade edilmeden ikinci aktif ikame oluşturulamaz.";
  if (message.includes("REPLACEMENT_PLATE_REQUIRED")) return "İkame araç verildiyse ikame araç plakası zorunludur.";
  if (message.includes("REPLACEMENT_RETURN_REQUIRED")) return "İkame araç kullanıldıysa iade tarihi zorunludur.";
  if (message.includes("ACTIVE_REPLACEMENT_MUST_BE_RETURNED")) return "Bu servis kaydına bağlı aktif ikame araç bulunmaktadır. Öncelikle ikame araç iade işlemini tamamlayınız.";
  if (message.includes("FUTURE_START_DATE")) return "Başlangıç tarihi bugünün tarihinden ileri olamaz.";
  if (message.includes("SERVICE_ODOMETER_REQUIRED")) return "Servis giriş kilometresi zorunludur.";
  if (message.includes("SERVICE_ODOMETER_TOO_LOW")) return "Servis giriş kilometresi aracın mevcut kilometresinden düşük olamaz.";
  if (message.includes("SERVICE_OUT_ODOMETER_REQUIRED")) return "Servisten çıkış KM zorunludur.";
  if (message.includes("SERVICE_OUT_ODOMETER_BELOW_CURRENT")) return "Servisten çıkış kilometresi aracın mevcut veya servis giriş kilometresinden düşük olamaz.";
  if (message.includes("REPLACEMENT_HISTORY_IMMUTABLE")) return "Geçmiş ikame kaydı silinemez; plaka ve geçmiş bilgileri kayıtlı kalmalıdır.";
  if (message.includes("VEHICLE_MUST_BE_IN_SERVICE_FOR_REPLACEMENT")) return "İkame araç ekleyebilmek için önce araç durumunu Serviste olarak güncellemelisiniz.";
  if (message.includes("INVALID_RETURN_DATE") || message.includes("INVALID_SERVICE_OUT_DATE")) return "Girdiğiniz çıkış / iade tarihi başlangıç tarihinden önce olamaz.";
  return "İşlem tamamlanamadı. Bilgileri kontrol edip tekrar deneyin.";
}

function auditChangeSummary(oldRaw: unknown, newRaw: unknown) {
  const parse=(v:unknown)=>{if(!v)return null;if(typeof v==="object")return v as Record<string,unknown>;try{return JSON.parse(String(v)) as Record<string,unknown>}catch{return null}};
  const oldV=parse(oldRaw),newV=parse(newRaw);
  if(!oldV&&!newV)return "—";
  if(!oldV&&newV)return "Kayıt oluşturuldu";
  if(oldV&&!newV)return "Kayıt silindi";
  const keys=Array.from(new Set([...Object.keys(oldV||{}),...Object.keys(newV||{})]));
  const changed=keys.filter(k=>JSON.stringify(oldV?.[k]??null)!==JSON.stringify(newV?.[k]??null)).filter(k=>!["updated_at","updated_by"].includes(k));
  if(!changed.length)return "Değişiklik kaydı";
  return changed.slice(0,4).map(k=>`${k}: ${String(oldV?.[k]??"—").slice(0,45)} → ${String(newV?.[k]??"—").slice(0,45)}`).join(" • ")+(changed.length>4?` • +${changed.length-4} alan`:"");
}

export default async function VehicleDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; saved?: string; error?: string }> }) {
  const { id: rawId } = await params;
  let id=rawId;
  try{id=decodeURIComponent(rawId)}catch{notFound()}
  const sp = await searchParams;
  const tab = normalizeTab(sp.tab);
  const { db } = await requireUser();
  if (!db) return <div className="notice">Yerel veritabanı hazırlandıktan sonra araç detayları burada görüntülenecek.</div>;

  const { data: v } = await db.from("vehicles").select("*").eq("id", id).maybeSingle();
  if (!v) notFound();
  if(v.is_replacement)redirect('/araclar?tur=ikame');
  const sql=getDatabase();
  const assignmentPersonnel=sql.prepare("SELECT id,first_name,last_name,company,branch,department,phone FROM personnel WHERE status='ACTIVE' AND deleted_at IS NULL ORDER BY last_name,first_name").all() as any[];
  const defs=(category:string)=>sql.prepare("SELECT name FROM system_definitions WHERE category=? AND is_active=1 ORDER BY sort_order,name").all(category).map((x:any)=>x.name) as string[];
  const fleetCompanies=defs("fleet_company"),tireDealers=defs("tire_dealer"),vehicleTypes=defs("vehicle_type"),fuelTypes=defs("fuel_type"),transmissions=defs("transmission");

  const [assignQ, serviceQ, odoQ, maintQ, accQ, damQ, tireQ, finesQ, complianceQ, attachmentsQ, statusQ] = await Promise.all([
    db.from("vehicle_assignments").select("id,assigned_to,personnel_snapshot,delivered_by,delivery_date,delivery_odometer,vehicle_condition_delivery,delivery_description,return_date,return_odometer,returned_to,vehicle_condition_return,return_description,created_at").eq("vehicle_id", id).order("delivery_date", { ascending: false }).limit(100),
    db.from("vehicle_service_records").select("*").eq("vehicle_id", id).order("service_in_at", { ascending: false }).limit(100),
    db.from("vehicle_odometer_history").select("id,previous_odometer,new_odometer,recorded_at,description,is_correction,correction_reason").eq("vehicle_id", id).order("recorded_at", { ascending: false }).limit(150),
    db.from("vehicle_maintenance").select("id,maintenance_date,odometer,service_name,maintenance_type,description,cost,status,next_maintenance_date,next_maintenance_odometer,created_at").eq("vehicle_id", id).order("maintenance_date", { ascending: false }).limit(100),
    db.from("vehicle_accidents").select("id,file_number,accident_date,status,description,actual_cost,created_at").eq("vehicle_id", id).order("accident_date", { ascending: false }).limit(100),
    db.from("vehicle_damages").select("id,damage_date,damage_type,damaged_area,description,cost,status,replacement_plate,replacement_received_at,replacement_returned_at,replacement_company,replacement_notes,created_at").eq("vehicle_id", id).order("damage_date", { ascending: false }).limit(100),
    db.from("vehicle_tire_transactions").select("id,transaction_date,transaction_type,brand,model,size,quantity,odometer,storage_dealer,performed_by_name,created_at").eq("vehicle_id", id).order("transaction_date", { ascending: false }).limit(100),
    db.from("vehicle_traffic_fines").select("id,fine_date,fine_time,driver,fine_type,amount,payment_status,payment_date,description,created_at").eq("vehicle_id", id).order("fine_date", { ascending: false }).limit(100),
    db.from("vehicle_compliance_documents").select("id,document_type,start_date,end_date,description,created_at").eq("vehicle_id", id).order("end_date", { ascending: false }).limit(100),
    db.from("attachments").select("id,entity_type,entity_id,description,created_at,attachment_versions(id,version_number,original_filename,mime_type,file_size,uploaded_at)").eq("entity_type", "vehicle").eq("entity_id", id).eq("is_active", true).order("created_at", { ascending: false }),
    db.from("vehicle_status_history").select("id,old_status,new_status,changed_at,description").eq("vehicle_id", id).order("changed_at", { ascending: false }).limit(150),
  ]);

  const assignments = assignQ.data ?? [];
  const services = serviceQ.data ?? [];
  const odo = odoQ.data ?? [];
  const maint = maintQ.data ?? [];
  const acc = accQ.data ?? [];
  const dam = damQ.data ?? [];
  const tire = tireQ.data ?? [];
  const fines = finesQ.data ?? [];
  const compliance = complianceQ.data ?? [];
  const vehicleAttachments = attachmentsQ.data ?? [];
  const statusHist = statusQ.data ?? [];
  const activeAssignment = assignments.find((x: any) => !x.return_date) ?? null;
  const openService = services.find((x: any) => x.status === "OPEN") ?? null;
  const operational = vehicleOperationalStatus(v.status, !!activeAssignment, !!openService);
  const today = new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const nowParts = new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date());
  const nowMap = Object.fromEntries(nowParts.map(x=>[x.type,x.value]));
  const nowLocal = `${nowMap.year}-${nowMap.month}-${nowMap.day}T${nowMap.hour}:${nowMap.minute}`;

  const serviceIds = services.map((s: any) => s.id);
  const { data: serviceAttachmentsRaw } = serviceIds.length
    ? await db.from("attachments").select("id,entity_id,description,created_at,attachment_versions(id,version_number,original_filename,mime_type,file_size,uploaded_at)").eq("entity_type", "vehicle_service_record").in("entity_id", serviceIds).eq("is_active", true).order("created_at", { ascending: false })
    : { data: [] as any[] };
  const serviceAttachments = serviceAttachmentsRaw ?? [];
  const serviceFilesByRecord = new Map<string, any[]>();
  for (const a of serviceAttachments) serviceFilesByRecord.set(a.entity_id, [...(serviceFilesByRecord.get(a.entity_id) ?? []), a]);

  const fineIds = fines.map((f:any)=>f.id);
  const { data: fineAttachmentsRaw } = fineIds.length
    ? await db.from("attachments").select("id,entity_id,description,created_at,attachment_versions(id,version_number,original_filename,mime_type,file_size,uploaded_at)").eq("entity_type","traffic_fine").in("entity_id",fineIds).eq("is_active",true).order("created_at",{ascending:false})
    : {data:[] as any[]};
  const fineFilesByRecord = new Map<string, any[]>();
  for(const a of (fineAttachmentsRaw??[])) fineFilesByRecord.set(a.entity_id,[...(fineFilesByRecord.get(a.entity_id)??[]),a]);

  const assignmentIds = assignments.map((a: any) => a.id);
  const { data: assignmentAttachmentsRaw } = assignmentIds.length
    ? await db.from("attachments").select("id,entity_id,description,created_at,attachment_versions(id,version_number,original_filename,mime_type,file_size,uploaded_at)").eq("entity_type", "assignment").in("entity_id", assignmentIds).eq("is_active", true).order("created_at", { ascending: false })
    : { data: [] as any[] };
  const assignmentAttachments = assignmentAttachmentsRaw ?? [];
  const assignmentFilesByRecord = new Map<string, any[]>();
  for (const a of assignmentAttachments) assignmentFilesByRecord.set(a.entity_id, [...(assignmentFilesByRecord.get(a.entity_id) ?? []), a]);

  const relatedAuditIds = Array.from(new Set([id, ...assignmentIds, ...serviceIds, ...odo.map((x:any)=>x.id), ...maint.map((x:any)=>x.id), ...acc.map((x:any)=>x.id), ...dam.map((x:any)=>x.id), ...tire.map((x:any)=>x.id), ...fines.map((x:any)=>x.id)]));
  const auditRows = relatedAuditIds.length ? sql.prepare(`SELECT id,created_at,user_name_snapshot,module,action,entity_reference,old_values,new_values,description FROM audit_logs WHERE entity_id IN (${relatedAuditIds.map(()=>"?").join(",")}) ORDER BY created_at DESC,id DESC LIMIT 250`).all(...relatedAuditIds) as any[] : [];
  const usageRows = sql.prepare(`SELECT vu.*,p.first_name,p.last_name FROM vehicle_usage_records vu LEFT JOIN personnel p ON p.id=vu.personnel_id WHERE vu.vehicle_id=? ORDER BY vu.checkout_at DESC,vu.created_at DESC,vu.id DESC LIMIT 250`).all(id) as any[];
  const replacementRows = sql.prepare(`SELECT * FROM vehicle_replacement_records WHERE vehicle_id=? ORDER BY COALESCE(replacement_received_at,created_at) DESC,created_at DESC,id DESC LIMIT 250`).all(id) as any[];
  const activeReplacement = replacementRows.find((x:any)=>x.status==="ACTIVE"&&!x.replacement_returned_at) ?? null;
  const activeCaseReplacement = replacementRows.find((x:any)=>x.status==="ACTIVE"&&!x.replacement_returned_at&&["ACCIDENT","DAMAGE"].includes(x.source_type)) ?? null;
  const inServiceAccident = acc.find((x:any)=>x.status==="IN_SERVICE") ?? null;
  const inServiceDamage = dam.find((x:any)=>x.status==="IN_SERVICE") ?? null;
  const blockingCaseOperation = inServiceAccident
    ? {source_type:"ACCIDENT", source_id:inServiceAccident.id, replacement_plate:activeCaseReplacement?.source_type==="ACCIDENT"&&activeCaseReplacement?.source_id===inServiceAccident.id?activeCaseReplacement.replacement_plate:null}
    : inServiceDamage
      ? {source_type:"DAMAGE", source_id:inServiceDamage.id, replacement_plate:activeCaseReplacement?.source_type==="DAMAGE"&&activeCaseReplacement?.source_id===inServiceDamage.id?activeCaseReplacement.replacement_plate:null}
      : activeCaseReplacement;
  const blockingCaseHref = blockingCaseOperation ? (blockingCaseOperation.source_type === "ACCIDENT" ? `/kaza-hasar/${blockingCaseOperation.source_id}` : `/kaza-hasar/hasar/${blockingCaseOperation.source_id}`) : null;

  const costHistory=annualCosts(id),year=currentYear();
  const thisYear=costHistory.find(r=>r.year===year);
  const serviceCost=thisYear?.maintenance||0,legacyMaintenanceCost=0,accidentCost=thisYear?.damage||0,damageCost=0;

  async function deleteVehicle() {
    "use server";
    const { db, user } = await requireUser();
    if (!db || !user) return;

    const [activeAssign, activeService] = await Promise.all([
      db.from("vehicle_assignments").select("id").eq("vehicle_id", id).is("return_date", null).limit(1).maybeSingle(),
      db.from("vehicle_service_records").select("id").eq("vehicle_id", id).eq("status", "OPEN").limit(1).maybeSingle(),
    ]);

    if (activeAssign.data) redirect(`/araclar/${id}/genel?error=${encodeURIComponent("Araç silinmeden önce aktif zimmet iade alınmalıdır.")}`);
    if (activeService.data) redirect(`/araclar/${id}/genel?error=${encodeURIComponent("Araç silinmeden önce açık servis kaydı tamamlanmalıdır.")}`);

    const { error } = await db.from("vehicles").update({
      is_active: false,
      status: "INACTIVE",
      responsible_person: null,
      updated_by: user.id,
    }).eq("id", id);

    if (error) throw new Error("Araç silinemedi.");

    await db.from("attachments").update({ is_active: false }).eq("entity_type", "vehicle").eq("entity_id", id);
    revalidatePath("/araclar");
    revalidatePath("/ana-panel");
    redirect("/araclar?deleted=1");
  }

  async function restoreVehicle() {
    "use server";
    const { db, user } = await requireUser();
    if (!db || !user) return;
    const { error } = await db.from("vehicles").update({
      is_active: true,
      status: "ACTIVE",
      updated_by: user.id,
    }).eq("id", id);
    if (error) throw new Error("Araç tekrar aktifleştirilemedi.");
    revalidatePath(`/araclar/${id}`);
    revalidatePath("/araclar");
    revalidatePath("/ana-panel");
    redirect(`/araclar/${id}/genel?saved=1`);
  }

  async function updateGeneral(fd: FormData) {
    "use server";
    const { db, user } = await requireUser();
    const [activeAssign, activeService] = await Promise.all([
      db.from("vehicle_assignments").select("assigned_to").eq("vehicle_id", id).is("return_date", null).limit(1).maybeSingle(),
      db.from("vehicle_service_records").select("id").eq("vehicle_id", id).eq("status", "OPEN").limit(1).maybeSingle(),
    ]);
    const ownership=String(fd.get("ownership_type")||"OWNED"),requestedStatus=String(fd.get("status")||"ACTIVE"),plate=String(fd.get("plate")||"").trim().toUpperCase(),brand=String(fd.get("brand")||"").trim(),model=String(fd.get("model")||"").trim(),vehicleType=String(fd.get("vehicle_type")||"").trim(),tireDealer=String(fd.get("tire_storage_dealer")||"").trim();
    if(!plate||!brand||!model||!vehicleType||!tireDealer) redirect(`/araclar/${id}/genel?error=${encodeURIComponent("Plaka, marka, model, araç tipi ve lastik depo bayisi zorunludur.")}`);
    const fleet=ownership==="FLEET"?String(fd.get("fleet_company")||"").trim():"";if(ownership==="FLEET"&&!fleet)redirect(`/araclar/${id}/genel?error=${encodeURIComponent("Filo araçlarında filo şirketi zorunludur.")}`);
    const contractStart=ownership==="FLEET"?(String(fd.get("contract_start_date")||"").trim()||null):null;
    const contractEnd=ownership==="FLEET"?(String(fd.get("contract_end_date")||"").trim()||null):null;
    const kmRaw=String(fd.get("contract_km_limit")||"").trim();const contractKm=ownership==="FLEET"&&kmRaw!==""?Number(kmRaw):null;
    // Sözleşme alanları kısmi olabilir. Araç genel bilgilerini düzenlemek, eksik sözleşme nedeniyle engellenmez.
    const todayLocal=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    if(contractStart&&contractStart>todayLocal)redirect(`/araclar/${id}/genel?error=${encodeURIComponent("Sözleşme başlangıç tarihi bugünün tarihinden ileri olamaz.")}`);
    if(contractStart&&contractEnd&&contractEnd<=contractStart)redirect(`/araclar/${id}/genel?error=${encodeURIComponent("Sözleşme bitiş tarihi başlangıç tarihinden sonra olmalıdır.")}`);
    if(contractKm!=null&&(!Number.isSafeInteger(contractKm)||contractKm<=0))redirect(`/araclar/${id}/genel?error=${encodeURIComponent("Sözleşme KM limiti 0'dan büyük tam sayı olmalıdır.")}`);
    // Server Action içine render sırasında açılmış DatabaseSync nesnesini capture etme.
    // DatabaseSync serileştirilemez; işlem anında yeni erişim getDatabase() üzerinden alınır.
    const actionDb=getDatabase();
    const payload:any={plate,brand,model,model_year:Number(fd.get("model_year")||0),vehicle_type:vehicleType,fuel_type:String(fd.get("fuel_type")||"").trim()||null,transmission:String(fd.get("transmission")||"").trim()||null,color:String(fd.get("color")||"").trim()||null,vin:String(fd.get("vin")||"").trim()||null,engine_number:String(fd.get("engine_number")||"").trim()||null,registration_serial_no:String(fd.get("registration_serial_no")||"").trim()||null,registration_document_no:String(fd.get("registration_document_no")||"").trim()||null,registration_date:String(fd.get("registration_date")||"")||null,ownership_type:ownership,fleet_company:fleet||null,contract_start_date:contractStart,contract_end_date:contractEnd,contract_km_limit:contractKm,contract_reference:ownership==="FLEET"?(String(fd.get("contract_reference")||"").trim()||null):null,planned_return_date:ownership==="FLEET"?(String(fd.get("planned_return_date")||"").trim()||null):null,fleet_description:ownership==="FLEET"?(String(fd.get("fleet_description")||"").trim()||null):null,tire_storage_dealer:tireDealer,updated_by:user.id,responsible_person:activeAssign.data?.assigned_to??(String(fd.get("responsible_person")||"").trim()||null)};
    if(!activeAssign.data&&!activeService.data)payload.status=requestedStatus;
    let saveError="";
    try{updateVehicleGeneralRecord(actionDb,id,user.id,payload)}catch(e){console.error("VEHICLE_GENERAL_UPDATE_ERROR",e);saveError=vehicleUpdateErrorMessage(e)}
    if(saveError)redirect(`/araclar/${id}/genel?error=${encodeURIComponent(saveError)}`);
    revalidatePath(`/araclar/${id}`);revalidatePath("/araclar");revalidatePath("/ana-panel");redirect(`/araclar/${id}/genel?saved=1`);
  }

  async function createAssignment(fd: FormData) {
    "use server";
    const { db, user } = await requireUser();
    if (!db || !user) return;
    const { data, error } = await db.rpc("create_vehicle_assignment", {
      p_vehicle_id: id,
      p_assigned_to: String(fd.get("assigned_to") || "").trim(),
      p_personnel_id: String(fd.get("personnel_id") || ""),
      p_delivered_by: String(fd.get("delivered_by") || "").trim() || null,
      p_delivery_date: String(fd.get("delivery_date")),
      p_delivery_odometer: Number(fd.get("delivery_odometer") || 0) || null,
      p_vehicle_condition: String(fd.get("condition") || "").trim() || null,
      p_description: String(fd.get("description") || "").trim() || null,
    });
    if (error) redirect(`/araclar/${id}/zimmet?error=${encodeURIComponent(errMessage(error.message))}`);
    const file = fd.get("file");
    if (file instanceof File && file.size > 0) await uploadAttachmentVersion({ db, userId: user.id, file, entityType: "assignment", entityId: String(data), description: "Zimmet belgesi" });
    revalidatePath(`/araclar/${id}`); revalidatePath("/araclar"); revalidatePath("/ana-panel");
    redirect(`/araclar/${id}/zimmet?saved=1`);
  }

  async function returnAssignment(fd: FormData) {
    "use server";
    const { db, user } = await requireUser();
    if (!db || !user) return;
    const assignmentId = String(fd.get("assignment_id"));
    const { error } = await db.rpc("return_vehicle_assignment", {
      p_assignment_id: assignmentId,
      p_return_date: String(fd.get("return_date")),
      p_return_odometer: Number(fd.get("return_odometer") || 0) || null,
      p_returned_to: String(fd.get("returned_to") || "").trim() || null,
      p_vehicle_condition: String(fd.get("return_condition") || "").trim() || null,
      p_description: String(fd.get("return_description") || "").trim() || null,
    });
    if (error) redirect(`/araclar/${id}/zimmet?error=${encodeURIComponent(errMessage(error.message))}`);
    const file = fd.get("file");
    if (file instanceof File && file.size > 0) await uploadAttachmentVersion({ db, userId: user.id, file, entityType: "assignment", entityId: assignmentId, description: "Araç iade belgesi" });
    revalidatePath(`/araclar/${id}`); revalidatePath("/araclar"); revalidatePath("/ana-panel");
    redirect(`/araclar/${id}/zimmet?saved=1`);
  }

  async function startService(fd: FormData) {
    "use server";
    const { db, user } = await requireUser();
    if (!db || !user) return;
    const raw = getDatabase();
    const activeCase = raw.prepare("SELECT id,'ACCIDENT' AS source_type FROM vehicle_accidents WHERE vehicle_id=? AND status='IN_SERVICE' UNION ALL SELECT id,'DAMAGE' AS source_type FROM vehicle_damages WHERE vehicle_id=? AND status='IN_SERVICE' UNION ALL SELECT source_id AS id,source_type FROM vehicle_replacement_records WHERE vehicle_id=? AND status='ACTIVE' AND source_type IN ('ACCIDENT','DAMAGE') LIMIT 1").get(id,id,id) as any;
    if (activeCase) redirect(`/araclar/${id}/servis-ikame?error=${encodeURIComponent("Bu araç Kaza / Hasar bölümünde aktif bir servis sürecindedir. Mevcut Kaza / Hasar kaydı tamamlanmadan veya kapatılmadan yeni Servis / İkame kaydı oluşturulamaz.")}`);
    const hasReplacement = fd.get("replacement_vehicle_provided") === "on";
    const { data, error } = await db.rpc("start_vehicle_service", {
      p_vehicle_id: id,
      p_service_in_at: String(fd.get("service_in_at")),
      p_service_name: String(fd.get("service_name") || "").trim(),
      p_service_reason: String(fd.get("service_reason") || "").trim(),
      p_odometer: Number(fd.get("odometer") || 0) || null,
      p_notes: String(fd.get("notes") || "").trim() || null,
      p_cost: Number(fd.get("cost") || 0),
      p_next_maintenance_date: String(fd.get("next_maintenance_date") || "") || null,
      p_next_maintenance_odometer: Number(fd.get("next_maintenance_odometer") || 0) || null,
      p_replacement_vehicle_provided: false,
      p_replacement_plate: null,
      p_replacement_received_at: null,
    });
    if (error) redirect(`/araclar/${id}/servis-ikame?error=${encodeURIComponent(errMessage(error.message))}`);
    if (data && hasReplacement) {
      try {
        fd.set("operation", "create");
        manageReplacement({sourceType:"SERVICE",sourceId:String(data),vehicleId:id,user},fd);
      } catch (e) {
        redirect(`/araclar/${id}/servis-ikame?error=${encodeURIComponent(e instanceof Error?e.message:"İkame araç oluşturulamadı.")}`);
      }
    }
    const file = fd.get("file");
    if (file instanceof File && file.size > 0) await uploadAttachmentVersion({ db, userId: user.id, file, entityType: "vehicle_service_record", entityId: String(data), description: "Servis belgesi" });
    revalidatePath(`/araclar/${id}`); revalidatePath("/araclar"); revalidatePath("/ana-panel"); revalidatePath("/dikkat-gerektirenler");
    redirect(`/araclar/${id}/servis-ikame?saved=1`);
  }

  async function serviceReplacementAction(fd: FormData) {
    "use server";
    const { user } = await requireUser(); if (!user) return;
    const activeService=getDatabase().prepare("SELECT id FROM vehicle_service_records WHERE vehicle_id=? AND status='OPEN' ORDER BY created_at DESC LIMIT 1").get(id) as any;
    const serviceId=String(fd.get("service_id")||activeService?.id||"");
    if(!serviceId) redirect(`/araclar/${id}/servis-ikame?error=${encodeURIComponent("Aktif servis kaydı bulunamadı.")}`);
    try {
      manageReplacement({sourceType:"SERVICE",sourceId:serviceId,vehicleId:id,user},fd);
    } catch (e) {
      redirect(`/araclar/${id}/servis-ikame?error=${encodeURIComponent(e instanceof Error?e.message:"İkame işlemi tamamlanamadı.")}`);
    }
    revalidatePath(`/araclar/${id}`); revalidatePath("/araclar"); revalidatePath("/arama"); revalidatePath("/ana-panel");
    redirect(`/araclar/${id}/servis-ikame?saved=1`);
  }

  async function closeService(fd: FormData) {
    "use server";
    const { db } = await requireUser();
    if (!db) return;
    const { error } = await db.rpc("close_vehicle_service", {
      p_service_id: String(fd.get("service_id")),
      p_service_out_at: String(fd.get("service_out_at")),
      p_service_out_odometer: Number(fd.get("service_out_odometer")),
      p_completion_notes: String(fd.get("completion_notes") || "").trim() || null,
    });
    if (error) redirect(`/araclar/${id}/servis-ikame?error=${encodeURIComponent(errMessage(error.message))}`);
    revalidatePath(`/araclar/${id}`); revalidatePath("/araclar"); revalidatePath("/ana-panel"); revalidatePath("/dikkat-gerektirenler");
    redirect(`/araclar/${id}/servis-ikame?saved=1`);
  }

  async function addFine(fd: FormData) {
    "use server";
    const { db, user } = await requireUser();
    if (!db || !user) return;
    const paymentStatus=String(fd.get("payment_status")||"UNPAID");
    const { error } = await db.from("vehicle_traffic_fines").insert({ vehicle_id: id, fine_date: String(fd.get("fine_date")), fine_time: String(fd.get("fine_time") || "") || null, driver: String(fd.get("driver") || "") || null, fine_type: String(fd.get("fine_type")), amount: Number(fd.get("amount") || 0), payment_status: paymentStatus, payment_date: paymentStatus==="PAID" ? today : null, description: String(fd.get("description") || "") || null, created_by: user.id });
    if (error) redirect(`/araclar/${id}/dosyalar?error=${encodeURIComponent(errMessage(error.message))}`);
    await db.rpc("refresh_reminder_notifications");
    revalidatePath(`/araclar/${id}`);revalidatePath("/ana-panel");revalidatePath("/dikkat-gerektirenler");revalidatePath("/bildirimler");redirect(`/araclar/${id}/dosyalar?saved=1`);
  }
  async function updateFine(fd: FormData) {
    "use server";
    const { db } = await requireUser(); if(!db)return;
    const fineId=String(fd.get("fine_id"));const description=String(fd.get("description")||"").trim()||null;const paymentStatus=String(fd.get("payment_status")||"UNPAID");
    const paymentDate=paymentStatus==="PAID"?(String(fd.get("payment_date")||"").trim()||new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())):null;
    const {error}=await db.from("vehicle_traffic_fines").update({description,payment_status:paymentStatus,payment_date:paymentDate}).eq("id",fineId).eq("vehicle_id",id);
    if(error)redirect(`/araclar/${id}/dosyalar?error=${encodeURIComponent("Trafik cezası güncellenemedi.")}`);
    await db.rpc("refresh_reminder_notifications");
    revalidatePath(`/araclar/${id}`);revalidatePath("/ana-panel");revalidatePath("/dikkat-gerektirenler");revalidatePath("/bildirimler");redirect(`/araclar/${id}/dosyalar?saved=1`);
  }

  async function addCompliance(fd: FormData) {
    "use server";
    const { db, user } = await requireUser();
    if (!db || !user) return;
    const { error } = await db.from("vehicle_compliance_documents").insert({ vehicle_id: id, document_type: String(fd.get("document_type")), start_date: String(fd.get("start_date") || "") || null, end_date: String(fd.get("end_date")), description: String(fd.get("description") || "") || null, created_by: user.id });
    if (error) throw new Error("Belge süresi kaydedilemedi.");
    await db.rpc("refresh_reminder_notifications");
    revalidatePath(`/araclar/${id}`); revalidatePath("/ana-panel"); revalidatePath("/bildirimler");
  }
  async function updateCompliance(fd: FormData) {
    "use server";
    const { db } = await requireUser(); if(!db)return;
    const complianceId=String(fd.get("compliance_id"));
    const {error}=await db.from("vehicle_compliance_documents").update({start_date:String(fd.get("start_date")||"")||null,end_date:String(fd.get("end_date")),description:String(fd.get("description")||"")||null}).eq("id",complianceId).eq("vehicle_id",id);
    if(error)redirect(`/araclar/${id}/sure-takibi?error=${encodeURIComponent("Süre bilgisi güncellenemedi.")}`);
    await db.rpc("refresh_reminder_notifications");
    revalidatePath(`/araclar/${id}`);revalidatePath("/ana-panel");revalidatePath("/bildirimler");
    redirect(`/araclar/${id}/sure-takibi?saved=1`);
  }

  const events: Array<{ date: string; title: string; desc: string; kind: string; key?: string; createdAt?: string }> = [];
  for (const x of services) {
    events.push({ date: x.service_in_at, title: `Servise girdi — ${x.service_name}`, desc: x.service_reason || "Servis süreci başladı", kind: "service", key: `${x.id}:in` });
    if (x.service_out_at) events.push({ date: x.service_out_at, title: "Servisten çıktı", desc: `${x.service_name}${x.completion_notes ? ` • ${x.completion_notes}` : ""}`, kind: "service", key: `${x.id}:out` });
  }
  for (const x of assignments) {
    events.push({ date: x.delivery_date, title: `${x.assigned_to} kişisine zimmetlendi`, desc: `Araç durumu: Zimmetli${x.delivery_odometer ? ` • ${formatNumber(x.delivery_odometer)} KM` : ""}`, kind: "assignment", key: `${x.id}:delivery` });
    if (x.return_date) events.push({ date: x.return_date, title: `${x.assigned_to} kişisinden iade alındı`, desc: `Araç durumu: ${services.some((s: any) => s.status === "OPEN") ? "Serviste" : "Boşta"}${x.return_odometer ? ` • ${formatNumber(x.return_odometer)} KM` : ""}`, kind: "assignment", key: `${x.id}:return` });
  }
  for (const x of odo) events.push({ date: x.recorded_at, title: `KM ${formatNumber(x.previous_odometer)} → ${formatNumber(x.new_odometer)}`, desc: x.description || x.correction_reason || "KM güncellendi", kind: "odometer", key: x.id });
  for (const x of maint) events.push({ date: x.maintenance_date, title: `Eski bakım kaydı — ${x.maintenance_type}`, desc: x.description || x.service_name || "Bakım / servis", kind: "maintenance", key: x.id, createdAt: x.created_at });
  for (const x of acc) events.push({ date: x.accident_date, title: `Kaza — ${x.file_number}`, desc: x.description || uiLabel(x.status, accidentStatusLabel), kind: "accident", key: x.id, createdAt: x.created_at });
  for (const x of dam) events.push({ date: x.damage_date, title: `Hasar — ${x.damage_type}`, desc: x.description || uiLabel(x.status, damageStatusLabel), kind: "damage", key: x.id, createdAt: x.created_at });
  for (const x of tire) events.push({ date: x.transaction_date, title: `Lastik — ${uiLabel(x.transaction_type, tireTransactionLabel)}`, desc: [[x.brand, x.model, x.size].filter(Boolean).join(" ") || "Lastik işlemi", x.performed_by_name ? `İşlemi yapan: ${x.performed_by_name}` : null].filter(Boolean).join(" • "), kind: "tire", key: x.id, createdAt: x.created_at });
  for (const x of fines) events.push({ date: x.fine_date, title: `Trafik cezası — ${x.fine_type}`, desc: `${formatCurrency(x.amount)} • ${uiLabel(x.payment_status, paymentStatusLabel)}`, kind: "fine", key: x.id, createdAt: x.created_at });
  for (const x of usageRows) { events.push({date:x.checkout_at,title:`Günlük araç teslimi — ${x.personnel_name_snapshot}`,desc:`Teslim: ${(x.checkout_km_known?formatNumber(x.checkout_odometer):"Belirtilmedi")} KM${x.purpose?` • ${x.purpose}`:""}`,kind:"vehicle-usage",key:`${x.id}:out`}); if(x.return_at)events.push({date:x.return_at,title:`Günlük araç iadesi — ${x.personnel_name_snapshot}`,desc:`İade: ${formatNumber(x.return_odometer)} KM${x.return_note?` • ${x.return_note}`:""}`,kind:"vehicle-usage",key:`${x.id}:in`}); }
  for(const x of replacementRows){
    events.push({date:x.replacement_received_at||x.created_at,title:`İkame araç teslim alındı — ${x.replacement_plate}`,desc:[x.replacement_brand_model,x.replacement_company?`Firma: ${x.replacement_company}`:null,x.replacement_odometer!=null?`Başlangıç KM: ${formatNumber(x.replacement_odometer)}`:null].filter(Boolean).join(" • ")||"İkame araç kaydı oluşturuldu",kind:"replacement-record",key:`${x.id}:created`,createdAt:x.created_at});
    if(x.replacement_returned_at)events.push({date:x.replacement_returned_at,title:`İkame araç iade edildi — ${x.replacement_plate}`,desc:[x.return_reason,x.return_notes,x.replacement_return_odometer!=null?`İade KM: ${formatNumber(x.replacement_return_odometer)}`:null].filter(Boolean).join(" • ")||"İkame araç iade edildi",kind:"replacement-record",key:`${x.id}:returned`,createdAt:x.updated_at});
  }
  const autoServiceTimes = services.flatMap((s: any) => [s.service_in_at, s.service_out_at].filter(Boolean).map((d: string) => new Date(d).getTime()));
  for (const x of statusHist) {
    const t = new Date(x.changed_at).getTime();
    if (autoServiceTimes.some((st: number) => Math.abs(st - t) < 15000)) continue;
    events.push({ date: x.changed_at, title: "Araç durumu değiştirildi", desc: `${uiLabel(x.old_status, vehicleStatusLabel)} → ${uiLabel(x.new_status, vehicleStatusLabel)}`, kind: "status", key: x.id });
  }
  const journal=sql.prepare('SELECT * FROM vehicle_events WHERE vehicle_id=? ORDER BY julianday(created_at) DESC,id DESC').all(id) as any[];
  const recorded=new Set(journal.filter(r=>r.title.endsWith('oluşturuldu')).map(r=>r.entity_id));
  for(let i=events.length-1;i>=0;i--) {
    const e=events[i];
    if(recorded.has(String(e.key||'').split(':')[0])) events.splice(i,1);
    else e.createdAt=e.createdAt||e.date;
  }
  for(const r of journal){const detail=JSON.parse(r.details||'{}');const replacementPlate=detail.replacement_plate?`İkame Plaka: ${detail.replacement_plate}`:null;const title=r.entity_type==='vehicle_replacement_records'?(String(r.title).includes('oluşturuldu')?'İkame Araç Oluşturuldu':'İkame Araç Güncellendi'):r.title;events.push({date:r.created_at,createdAt:r.created_at,title,desc:[replacementPlate,detail.service_name,detail.note,detail.description,detail.entry_at?`Giriş: ${formatDateTime(detail.entry_at)} • ${formatNumber(detail.entry_km)} KM`:null,detail.exit_at?`Çıkış: ${formatDateTime(detail.exit_at)} • ${formatNumber(detail.exit_km)} KM`:null,detail.current_odometer!=null?`Güncel KM: ${formatNumber(detail.current_odometer)}`:null,detail.return_odometer!=null?`İade KM: ${formatNumber(detail.return_odometer)}`:null].filter(Boolean).join(' • '),kind:'journal',key:String(r.id)});}
  const stamp=(s:string)=>new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)?s+'+03:00':s).getTime()||0;
  events.sort((a,b)=>stamp(b.createdAt||b.date)-stamp(a.createdAt||a.date)||(a.kind==='journal'&&b.kind==='journal'?Number(b.key)-Number(a.key):String(b.key).localeCompare(String(a.key))));


  const replacementLinks=sql.prepare("SELECT r.*,v.plate main_plate FROM vehicle_replacement_records r JOIN vehicles v ON v.id=r.vehicle_id WHERE r.replacement_vehicle_id=? ORDER BY r.created_at DESC").all(id) as any[];
  const currentComplianceIds=new Set((sql.prepare("SELECT document_id FROM compliance_current WHERE vehicle_id=?").all(id) as any[]).map(x=>x.document_id));
  const complianceChanges=sql.prepare("SELECT * FROM compliance_change_history WHERE vehicle_id=? ORDER BY changed_at DESC").all(id) as any[];
  return <>
    {replacementLinks.length?<section className="notice section"><strong>İkame Araç</strong>{replacementLinks.map(r=><div key={r.id}>Bağlı olduğu araç: <Link href={`/araclar/${r.vehicle_id}`}>{r.main_plate}</Link> • Başlangıç: {formatDateTime(r.replacement_received_at)} • İade: {formatDateTime(r.replacement_returned_at)} • {r.status==='ACTIVE'?'Aktif':'İade edildi'}</div>)}</section>:null}
    {tab==='tracking'?<section className="card section"><div className="section-body"><Link className="btn btn-secondary" href="/araclar/sure-takibi-excel">Excel ile Süre Takibi Güncelle</Link>{complianceChanges.map(h=><p key={h.id}>{formatDateTime(h.changed_at)} • {uiLabel(h.document_type,documentTypeLabel)}: {formatDate(h.old_date)} → {formatDate(h.new_date)}</p>)}</div></section>:null}
    <div className="card vehicle-hero">
      <div className="hero-main"><h1>{v.plate}</h1><div className="meta"><span className={`pill ${v.ownership_type === "FLEET" ? "blue" : "gray"}`}>{v.ownership_type === "FLEET" ? "Filo" : "Özmal"}</span><span className={`pill ${operational.pill}`}>{operational.label}</span><span className="pill gray">{v.brand} {v.model} • {v.model_year}</span></div></div>
      <div className="stat-mini"><div className="label">Güncel KM</div><div className="value">{formatNumber(v.current_odometer)}</div></div>
      <div className="stat-mini"><div className="label">Zimmet / Sorumlu</div><div className="value" style={{ fontSize: 15 }}>{activeAssignment?.assigned_to || v.responsible_person || "—"}</div></div>
      <div className="stat-mini"><div className="label">İkame Araç</div><div className="value" style={{ fontSize: 15 }}>{activeReplacement?.replacement_plate || "—"}</div></div>
    </div>

    {openService ? <div className="notice section"><strong>Servis süreci devam ediyor.</strong> {openService.service_name} • Giriş: {formatDateTime(openService.service_in_at)}{openService.replacement_plate ? ` • İkame: ${openService.replacement_plate}` : ""}</div> : null}
    {!v.is_active ? <div className="error-box section"><strong>Bu araç silinmiş / pasif durumdadır.</strong> Geçmiş kayıtları korunmaktadır.</div> : null}
    <div className="tabs section">{tabs.map(([key, label]) => {const slug={general:"genel",assignment:"zimmet",service:"servis-ikame",tracking:"sure-takibi",files:"dosyalar",history:"gecmis"}[key];return <Link key={key} href={`/araclar/${id}/${slug}`} className={`tab ${tab === key ? "active" : ""}`}>{label}</Link>})}</div>
    {sp.saved === "1" ? <div className="success-box section">İşlem başarıyla kaydedildi.</div> : null}
    {sp.error ? <div className="error-box section">{sp.error}</div> : null}

    {tab === "general" && <>
      <div className="grid-kpi section">
        <div className="card kpi"><div className="kpi-label">Araç Durumu</div><div className="kpi-value" style={{ fontSize: 20 }}>{operational.label}</div></div>
        <div className="card kpi"><div className="kpi-label">Servis / Bakım</div><div className="kpi-value" style={{ fontSize: 20 }}>{formatCurrency(serviceCost + legacyMaintenanceCost)}</div></div>
        <div className="card kpi"><div className="kpi-label">Kaza / Hasar</div><div className="kpi-value" style={{ fontSize: 20 }}>{formatCurrency(accidentCost + damageCost)}</div></div>
        <div className="card kpi"><div className="kpi-label">Toplam Maliyet — {year}</div><div className="kpi-value" style={{ fontSize: 20 }}>{formatCurrency(serviceCost + legacyMaintenanceCost + accidentCost + damageCost)}</div></div>
      </div>
      <form action={updateGeneral} className="card section"><div className="section-head"><div><div className="section-title">Araç Genel Bilgileri</div><div className="page-sub">Araç eklenirken girilen önemli bilgiler burada eksiksiz görüntülenir ve düzenlenebilir.</div></div></div><div className="section-body">
        <div className="section-title" style={{marginBottom:10}}>Temel Araç Bilgileri</div><div className="form-grid">
          <div className="field"><label>Plaka *</label><input name="plate" className="input" defaultValue={v.plate} required/></div><div className="field"><label>Marka *</label><input name="brand" className="input" defaultValue={v.brand} required/></div>
          <div className="field"><label>Model *</label><input name="model" className="input" defaultValue={v.model} required/></div><div className="field"><label>Model Yılı *</label><input name="model_year" type="number" min="1950" max="2100" className="input" defaultValue={v.model_year} required/></div>
          <div className="field"><label>Araç Tipi *</label><select name="vehicle_type" className="select" defaultValue={v.vehicle_type} required>{vehicleTypes.length?vehicleTypes.map(x=><option key={x}>{x}</option>):<option>{v.vehicle_type}</option>}</select></div><div className="field"><label>Renk</label><input name="color" className="input" defaultValue={v.color||""}/></div>
          <div className="field"><label>Yakıt Tipi</label><select name="fuel_type" className="select" defaultValue={v.fuel_type||""}><option value="">Seçin</option>{fuelTypes.map(x=><option key={x}>{x}</option>)}</select></div><div className="field"><label>Şanzıman</label><select name="transmission" className="select" defaultValue={v.transmission||""}><option value="">Seçin</option>{transmissions.map(x=><option key={x}>{x}</option>)}</select></div>
        </div>
        <div className="section-title" style={{margin:"22px 0 10px"}}>Teknik Bilgiler</div><div className="form-grid">
          <div className="field"><label>Şasi Numarası</label><input name="vin" className="input" defaultValue={v.vin||""}/></div><div className="field"><label>Motor Numarası</label><input name="engine_number" className="input" defaultValue={v.engine_number||""}/></div>
          <div className="field"><label>Ruhsat Seri No</label><input name="registration_serial_no" className="input" defaultValue={v.registration_serial_no||""}/></div><div className="field"><label>Ruhsat Belge No</label><input name="registration_document_no" className="input" defaultValue={v.registration_document_no||""}/></div>
          <div className="field"><label>Ruhsat Tarihi</label><input name="registration_date" type="date" className="input" max={today} defaultValue={v.registration_date?String(v.registration_date).slice(0,10):""}/></div><div className="field"><label>Güncel KM</label><input className="input" value={formatNumber(v.current_odometer)} readOnly/></div>
        </div>
        <div className="section-title" style={{margin:"22px 0 10px"}}>Filo / Mülkiyet Bilgileri</div><div className="form-grid">
          <div className="field"><label>Mülkiyet Tipi</label><select name="ownership_type" className="select" defaultValue={v.ownership_type}><option value="FLEET">Kiralık / Filo</option><option value="OWNED">Özmal</option></select></div><div className="field"><label>Filo / Kiralama Firması</label><select name="fleet_company" className="select" defaultValue={v.fleet_company||""}><option value="">Seçin</option>{v.fleet_company&&!fleetCompanies.includes(v.fleet_company)?<option value={v.fleet_company}>{v.fleet_company}</option>:null}{fleetCompanies.map(x=><option key={x}>{x}</option>)}</select></div>
          <div className="field"><label>Sorumlu Kişi</label><input name="responsible_person" className="input" defaultValue={activeAssignment?.assigned_to || v.responsible_person || ""} readOnly={!!activeAssignment}/></div><div className="field"><label>Lastik Depo Bayisi *</label><select name="tire_storage_dealer" className="select" defaultValue={v.tire_storage_dealer||""} required>{v.tire_storage_dealer&&!tireDealers.includes(v.tire_storage_dealer)?<option value={v.tire_storage_dealer}>{v.tire_storage_dealer}</option>:null}{tireDealers.length?tireDealers.map(x=><option key={x}>{x}</option>):<option>{v.tire_storage_dealer}</option>}</select></div>
        </div>
        {v.ownership_type==="FLEET"?<><div className="section-title" style={{margin:"22px 0 10px"}}>Kiralama / Sözleşme Bilgileri</div><div className="page-sub" style={{marginBottom:10}}>Filo/kiralama sözleşmesine ait temel bilgiler burada saklanır.</div><div className="form-grid">
          <div className="field"><label>Sözleşme Başlangıç Tarihi</label><input name="contract_start_date" type="date" className="input" defaultValue={v.contract_start_date?String(v.contract_start_date).slice(0,10):""}/></div><div className="field"><label>Sözleşme Bitiş Tarihi</label><input name="contract_end_date" type="date" className="input" defaultValue={v.contract_end_date?String(v.contract_end_date).slice(0,10):""}/></div>
          <div className="field"><label>Sözleşme Süresi</label><input className="input" readOnly value={v.contract_start_date&&v.contract_end_date?contractDurationText(String(v.contract_start_date),String(v.contract_end_date)):"—"}/></div><div className="field"><label>Sözleşme KM Limiti</label><input name="contract_km_limit" type="number" min="1" className="input" defaultValue={v.contract_km_limit??""}/><small>Sözleşmede belirtilen kilometre sınırını girin.</small></div>
          <div className="field"><label>Güncel KM</label><input className="input" readOnly value={`${formatNumber(Number(v.current_odometer||0))} KM`}/><small>Araçta kayıtlı mevcut kilometre bilgisidir.</small></div>
          <div className="field"><label>Sözleşme Referans / Araç No</label><input name="contract_reference" className="input" defaultValue={v.contract_reference||""}/></div><div className="field"><label>İade Planlanan Tarih</label><input name="planned_return_date" type="date" className="input" defaultValue={v.planned_return_date?String(v.planned_return_date).slice(0,10):""}/></div>
          <div className="field" style={{gridColumn:"1/-1"}}><label>Filo Açıklaması</label><textarea name="fleet_description" className="textarea" rows={2} defaultValue={v.fleet_description||""}/></div>
        </div></>:null}
        <div className="section-title" style={{margin:"22px 0 10px"}}>Operasyonel Bilgiler</div><div className="form-grid"><div className="field"><label>Temel Durum</label><select name="status" className="select" defaultValue={v.status} disabled={!!activeAssignment || !!openService}><option value="ACTIVE">Boşta</option><option value="MAINTENANCE">Bakımda</option><option value="INACTIVE">Kullanım Dışı</option></select><small>{activeAssignment || openService ? "Zimmetli ve Serviste durumları işlem akışından otomatik yönetilir." : "Zimmetli ve Serviste durumları manuel seçilmez."}</small></div><div className="field"><label>Güncel Zimmet</label><input className="input" value={activeAssignment?.assigned_to||"—"} readOnly/></div></div>
        <div className="form-actions"><SubmitButton>Bilgileri Güncelle</SubmitButton></div>
      </div></form>
      <div className="section"><OdometerForm vehicleId={id} current={v.current_odometer}/></div>
      <section className="card section danger-zone"><div className="section-head"><div><div className="section-title">{v.is_active ? "Araç Kaydını Sil" : "Araç Kaydını Geri Yükle"}</div><div className="page-sub">{v.is_active ? "Araç listeden kaldırılır; geçmiş ve işlem kayıtları korunur. Aktif zimmet veya açık servis varken silinemez." : "Silinen araç tekrar aktif araç listesine alınabilir."}</div></div></div><div className="section-body">{v.is_active?<form action={deleteVehicle}><ConfirmSubmitButton message={`${v.plate} plakalı aracı silmek istediğinize emin misiniz? Geçmiş kayıtları korunacak ve araç ana listeden kaldırılacaktır.`}>Aracı Sil</ConfirmSubmitButton></form>:<form action={restoreVehicle}><ConfirmSubmitButton className="btn btn-primary" message={`${v.plate} plakalı aracı tekrar aktif etmek istiyor musunuz?`}>Aracı Geri Yükle</ConfirmSubmitButton></form>}</div></section>
    </>}

    {tab === "general" && <CostHistory rows={thisYear?costHistory:[{year,vehicle_id:id,plate:v.plate,maintenance:0,damage:0,total:0},...costHistory]}/> }
    {tab === "assignment" && <>
      {!activeAssignment ? <form action="/api/local-actions" method="post" encType="multipart/form-data" className="card section"><input type="hidden" name="operation" value="create_assignment"/><input type="hidden" name="vehicle_id" value={id}/><input type="hidden" name="return_to" value={`/araclar/${id}/zimmet`}/><div className="section-head"><div><div className="section-title">Aracı Zimmetle</div><div className="page-sub">Tek kayıt oluşturulur; araç üzerinde kişi ve durum otomatik güncellenir.</div></div></div><div className="section-body"><div className="form-grid">
        <div className="field"><label>Teslim Alan *</label><select name="personnel_id" className="select" required><option value="">Personel seçin</option>{assignmentPersonnel.map(p=><option key={p.id} value={p.id}>{personnelLabel(p)}</option>)}</select></div><div className="field"><label>Teslim Eden</label><input name="delivered_by" className="input"/></div>
        <div className="field"><label>Teslim Tarihi / Saati *</label><input name="delivery_date" type="datetime-local" className="input" max={nowLocal} required/></div><div className="field"><label>Teslim KM</label><input name="delivery_odometer" type="number" min="0" className="input" defaultValue={v.current_odometer}/></div>
        <div className="field"><label>Araç Fiziksel Durumu</label><input name="condition" className="input" placeholder="Temiz, çizik mevcut..."/></div><div className="field"><label>Zimmet Dosyası</label><input type="file" name="file" className="input" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"/></div>
        <div className="field" style={{ gridColumn: "1/-1" }}><label>Açıklama</label><textarea name="description" className="textarea" rows={2}/></div>
      </div><div className="form-actions"><SubmitButton>Zimmeti Başlat</SubmitButton></div></div></form> : <form action="/api/local-actions" method="post" encType="multipart/form-data" className="card section"><input type="hidden" name="operation" value="return_assignment"/><input type="hidden" name="vehicle_id" value={id}/><input type="hidden" name="return_to" value={`/araclar/${id}/zimmet`}/><input type="hidden" name="assignment_id" value={activeAssignment.id}/><div className="section-head"><div><div className="section-title">Aktif Zimmet — {activeAssignment.assigned_to}</div><div className="page-sub">{formatDateTime(activeAssignment.delivery_date)} tarihinde teslim edildi.</div></div><span className="pill orange">Zimmetli</span></div><div className="section-body"><div className="form-grid">
        <div className="field"><label>İade Tarihi / Saati *</label><input name="return_date" type="datetime-local" className="input" max={nowLocal} required/></div><div className="field"><label>İade KM</label><input name="return_odometer" type="number" required min={Math.max(activeAssignment.delivery_odometer ?? 0,v.current_odometer ?? 0)} className="input" defaultValue={v.current_odometer}/></div>
        <div className="field"><label>Teslim Alan</label><input name="returned_to" className="input"/></div><div className="field"><label>Araç Fiziksel Durumu</label><input name="return_condition" className="input"/></div>
        <div className="field"><label>İade Belgesi / Fotoğraf</label><input type="file" name="file" className="input" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"/></div><div className="field" style={{ gridColumn: "1/-1" }}><label>Açıklama</label><textarea name="return_description" className="textarea" rows={2}/></div>
      </div><div className="form-actions"><SubmitButton>İade Al</SubmitButton></div></div></form>}
      <section className="card section table-wrap"><div className="section-head"><div className="section-title">Zimmet Geçmişi</div></div><table className="table"><thead><tr><th>Kişi</th><th>Teslim</th><th>Teslim KM</th><th>İade</th><th>İade KM</th><th>Belge</th></tr></thead><tbody>{assignments.map((x: any) => <tr key={x.id}><td><strong>{x.assigned_to}</strong></td><td>{formatDateTime(x.delivery_date)}</td><td>{x.delivery_odometer ? formatNumber(x.delivery_odometer) : "—"}</td><td>{x.return_date ? formatDateTime(x.return_date) : <span className="pill orange">Aktif</span>}</td><td>{x.return_odometer ? formatNumber(x.return_odometer) : "—"}</td><td><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{(assignmentFilesByRecord.get(x.id) ?? []).flatMap((a:any)=>(a.attachment_versions??[]).sort((aa:any,bb:any)=>bb.version_number-aa.version_number).slice(0,1).map((ver:any)=><a key={ver.id} href={`/api/attachments/version/${ver.id}`} target="_blank" className="btn btn-secondary">Görüntüle</a>))}{!(assignmentFilesByRecord.get(x.id)??[]).length?"—":null}</div></td></tr>)}</tbody></table>{!assignments.length ? <div className="empty">Zimmet geçmişi bulunmuyor.</div> : null}</section>
    </>}

    {tab === "service" && <><VehicleCaseServices vehicleId={id}/>
      {!openService && blockingCaseOperation ? <section className="card section"><div className="section-head"><div><div className="section-title">Yeni Servis / İkame Kaydı Kilitli</div><div className="page-sub">Aynı araç için Kaza / Hasar ve Servis / İkame süreçleri aynı anda açık bırakılamaz.</div></div><span className="pill orange">Aktif Kaza / Hasar</span></div><div className="section-body"><div className="warning-box">Bu araç Kaza / Hasar bölümünde <strong>Serviste</strong> durumundadır{blockingCaseOperation.replacement_plate ? <> ve aktif ikame aracı <strong>{blockingCaseOperation.replacement_plate}</strong> bulunmaktadır</> : null}. Mevcut Kaza / Hasar kaydı tamamlanmadan veya kapatılmadan yeni Servis / İkame kaydı oluşturulamaz.</div>{blockingCaseHref?<div className="form-actions"><Link href={blockingCaseHref} className="btn btn-secondary">Mevcut Kaza / Hasar Kaydını Aç</Link></div>:null}</div></section> : !openService ? <form action={startService} className="card section"><div className="section-head"><div><div className="section-title">Servise Al / İkame Araç Kaydet</div><div className="page-sub">Servis ve ikame bilgisi tek kayıttan araç durumuna ve geçmişe yansır.</div></div></div><div className="section-body"><div className="form-grid">
        <div className="field"><label>Servise Giriş Tarihi / Saati *</label><input name="service_in_at" type="datetime-local" className="input" max={nowLocal} required/></div><div className="field"><label>Servis / Firma *</label><input name="service_name" className="input" required/></div>
        <div className="field"><label>Servise Giriş Nedeni *</label><input name="service_reason" className="input" required/></div><div className="field"><label>Giriş KM *</label><input name="odometer" type="number" min={Number(v.current_odometer||0)} className="input" defaultValue={v.current_odometer} required/></div>
        <div className="field"><label>Maliyet</label><input name="cost" type="number" min="0" step="0.01" className="input"/></div><div className="field"><label>Sonraki Bakım Tarihi</label><input name="next_maintenance_date" type="date" className="input"/></div>
        <div className="field"><label>Sonraki Bakım KM</label><input name="next_maintenance_odometer" type="number" min="0" className="input"/></div><div className="field"><label>Belge</label><input type="file" name="file" className="input" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"/></div>
        <div className="field" style={{ gridColumn: "1/-1" }}><label><input type="checkbox" name="replacement_vehicle_provided"/> İkame araç verildi</label></div>
        <div className="field"><label>İkame Araç Plakası</label><input name="replacement_plate" className="input" placeholder="34 ABC 123"/></div><div className="field"><label>Marka / Model</label><input name="replacement_brand_model" className="input"/></div><div className="field"><label>İkame Teslim Alma Tarihi</label><input name="replacement_received_at" type="datetime-local" max={nowLocal} className="input"/></div><div className="field"><label>İkame Başlangıç KM (isteğe bağlı)</label><input name="replacement_odometer" type="number" min="0" className="input"/></div><div className="field"><label>İkame Firma / Kiralama Firması</label><input name="replacement_company" className="input"/></div><div className="field"><label>İkame Açıklaması / Not</label><input name="replacement_notes" className="input"/></div>
        <div className="field" style={{ gridColumn: "1/-1" }}><label>Açıklama / Not</label><textarea name="notes" className="textarea" rows={3}/></div>
      </div><div className="form-actions"><SubmitButton>Servis Kaydını Başlat</SubmitButton></div></div></form> : <section className="card section"><div className="section-head"><div><div className="section-title">Aktif Servis — {openService.service_name}</div><div className="page-sub">Giriş: {formatDateTime(openService.service_in_at)} • {openService.service_reason}</div></div><span className="pill blue">Serviste</span></div><div className="section-body"><ReplacementManager records={replacementRows.filter((r:any)=>r.source_type==="SERVICE"&&String(r.source_id)===String(openService.id))} uses={usageRows} action={serviceReplacementAction} canCreate={true} nowLocal={nowLocal} title="Servis İkame Araç Yönetimi"/><form action={closeService} className="section"><input type="hidden" name="service_id" value={openService.id}/><div className="section-title">Servisi Tamamla</div>{replacementRows.some((r:any)=>r.source_type==="SERVICE"&&String(r.source_id)===String(openService.id)&&r.status==="ACTIVE"&&!r.replacement_returned_at)?<div className="warning-box section">Bu servis kaydında aktif ikame araç bulunmaktadır. Servisi tamamlamadan önce yukarıdaki <strong>İkame Aracı İade Et</strong> işlemini tamamlayınız.</div>:null}<div className="form-grid section"><div className="field"><label>Servisten Çıkış Tarihi / Saati *</label><input name="service_out_at" type="datetime-local" max={nowLocal} className="input" required/></div><div className="field"><label>Servisten Çıkış KM *</label><input name="service_out_odometer" type="number" min={Math.max(Number(v.current_odometer||0),Number(openService.odometer||0))} className="input" required/></div><div className="field" style={{gridColumn:"1/-1"}}><label>Çıkış / Sonuç Notu</label><textarea name="completion_notes" className="textarea" rows={3}/></div></div><div className="form-actions"><SubmitButton>Servisi Tamamla</SubmitButton></div></form></div></section>}
      <section className="card section table-wrap"><div className="section-head"><div className="section-title">Servis / İkame Geçmişi</div></div><table className="table"><thead><tr><th>Giriş</th><th>Giriş KM</th><th>Servis</th><th>Neden</th><th>İkame</th><th>İkame Firma</th><th>İkame İade</th><th>Çıkış</th><th>Çıkış KM</th><th>Durum</th><th>Dosya</th></tr></thead><tbody>{services.map((x: any) => { const st = serviceState(x.status); return <tr key={x.id}><td>{formatDateTime(x.service_in_at)}</td><td>{x.odometer!=null?formatNumber(x.odometer):"—"}</td><td>{x.service_name}</td><td>{x.service_reason}</td><td>{x.replacement_plate || "—"}</td><td>{x.replacement_company||"—"}</td><td>{formatDateTime(x.replacement_returned_at)}</td><td>{formatDateTime(x.service_out_at)}</td><td>{x.service_out_odometer!=null?formatNumber(x.service_out_odometer):"—"}</td><td><span className={`pill ${st.pill}`}>{st.label}</span></td><td><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{(serviceFilesByRecord.get(x.id) ?? []).flatMap((a: any) => (a.attachment_versions ?? []).sort((aa: any, bb: any) => bb.version_number - aa.version_number).slice(0, 1).map((ver: any) => <a key={ver.id} href={`/api/attachments/version/${ver.id}`} target="_blank" className="btn btn-secondary">Görüntüle</a>))}<form action="/api/attachments" method="post" encType="multipart/form-data"><input type="hidden" name="entity_type" value="vehicle_service_record"/><input type="hidden" name="entity_id" value={x.id}/><input type="hidden" name="return_to" value={`/araclar/${id}/servis-ikame`}/><input type="file" name="file" className="input compact-file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" required/><button className="btn btn-secondary" type="submit">Belge Ekle</button></form></div></td></tr>})}</tbody></table>{!services.length ? <div className="empty">Servis kaydı bulunmuyor.</div> : null}</section>
      <section className="card section table-wrap"><div className="section-head"><div><div className="section-title">Merkezi İkame Araç Geçmişi</div><div className="page-sub">Servis, kaza ve bağımsız hasardan girilen ikame kayıtları ayrı kayıt kimlikleriyle korunur.</div></div></div><table className="table"><thead><tr><th>Kaynak</th><th>İkame Plaka</th><th>Başlangıç</th><th>Başlangıç KM</th><th>İade</th><th>İade KM</th><th>Firma</th><th>İade Nedeni / Not</th><th>Durum</th></tr></thead><tbody>{replacementRows.map((x:any)=><tr key={x.id}><td>{x.source_type==='SERVICE'?'Servis':x.source_type==='DAMAGE'?'Bağımsız Hasar':'Kaza'}</td><td><strong>{x.replacement_plate}</strong></td><td>{formatDateTime(x.replacement_received_at)}</td><td>{x.replacement_odometer==null?"—":formatNumber(x.replacement_odometer)}</td><td>{formatDateTime(x.replacement_returned_at)}</td><td>{x.replacement_return_odometer==null?"—":formatNumber(x.replacement_return_odometer)}</td><td>{x.replacement_company||"—"}</td><td>{x.return_reason||"—"}{x.return_notes?<div className="page-sub">{x.return_notes}</div>:null}{x.replacement_notes?<div className="page-sub">Kayıt notu: {x.replacement_notes}</div>:null}</td><td><span className={`pill ${x.status==='ACTIVE'?'blue':'green'}`}>{x.status==='ACTIVE'?'Aktif':'İade Edildi'}</span></td></tr>)}</tbody></table>{!replacementRows.length?<div className="empty">İkame araç geçmişi bulunmuyor.</div>:null}</section>
      {maint.length ? <section className="card section table-wrap"><div className="section-head"><div><div className="section-title">Önceki Bakım Kayıtları</div><div className="page-sub">Eski sistemden kalan kayıtlar korunur; yeni servis işlemleri yukarıdaki merkezi yapıdan yapılır.</div></div></div><table className="table"><thead><tr><th>Tarih</th><th>İşlem</th><th>Servis</th><th>KM</th><th>Maliyet</th></tr></thead><tbody>{maint.map((x: any) => <tr key={x.id}><td>{formatDate(x.maintenance_date)}</td><td>{x.maintenance_type}</td><td>{x.service_name || "—"}</td><td>{x.odometer ? formatNumber(x.odometer) : "—"}</td><td>{formatCurrency(x.cost)}</td></tr>)}</tbody></table></section> : null}
    </>}

    {tab === "tracking" && <section className="card section"><div className="section-head"><div><div className="section-title">Otopark ve Muayene Süre Takibi</div><div className="page-sub">Bitiş tarihleri, kalan gün ve yaklaşan süreler tek alanda takip edilir.</div></div></div><div className="section-body"><form action={addCompliance}><div className="form-grid"><div className="field"><label>Takip Türü *</label><select name="document_type" className="select" required><option value="PARKING">Otopark</option><option value="INSPECTION">Muayene</option><option value="TRAFFIC_INSURANCE">Trafik Sigortası</option><option value="CASCO">Kasko</option></select></div><div className="field"><label>Başlangıç</label><input name="start_date" type="date" className="input"/></div><div className="field"><label>Bitiş *</label><input name="end_date" type="date" className="input" required/></div><div className="field"><label>Açıklama</label><input name="description" className="input"/></div></div><div className="form-actions"><SubmitButton>Süre Kaydı Ekle</SubmitButton></div></form><div className="table-wrap section"><table className="table"><thead><tr><th>Tür</th><th>Başlangıç</th><th>Bitiş</th><th>Kalan Gün</th><th>Açıklama</th><th>Güncelle</th></tr></thead><tbody>{compliance.map((x:any)=><tr key={x.id}><td>{uiLabel(x.document_type,documentTypeLabel)}</td><td>{formatDate(x.start_date)}</td><td>{formatDate(x.end_date)}</td><td><strong>{currentComplianceIds.has(x.id)?remainingText(x.end_date,today):"Geçmiş kayıt"}</strong></td><td>{x.description||"—"}</td><td><form action={updateCompliance} className="inline-form"><input type="hidden" name="compliance_id" value={x.id}/><input className="input" type="date" name="start_date" defaultValue={x.start_date||""}/><input className="input" type="date" name="end_date" defaultValue={x.end_date||""} required/><input className="input" name="description" defaultValue={x.description||""} placeholder="Açıklama"/><SubmitButton className="btn btn-secondary">Güncelle</SubmitButton></form></td></tr>)}</tbody></table>{!compliance.length?<div className="empty">Henüz süre takip kaydı bulunmuyor.</div>:null}</div></div></section>}

    {tab === "files" && <div className="two-col section">
      <section className="card"><div className="section-head"><div className="section-title">Araç Dosyaları</div></div><div className="section-body"><form action="/api/attachments" method="post" encType="multipart/form-data"><input type="hidden" name="entity_type" value="vehicle"/><input type="hidden" name="entity_id" value={id}/><input type="hidden" name="return_to" value={`/araclar/${id}/dosyalar`}/><div className="field"><label>Dosya *</label><input type="file" name="file" className="input" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" required/></div><div className="field" style={{ marginTop: 10 }}><label>Açıklama</label><input name="description" className="input"/></div><button type="submit" className="btn btn-primary" style={{ marginTop: 12 }}>Dosya Yükle</button></form><div className="section">{vehicleAttachments.map((x: any) => <div className="alert-row" key={x.id}><div><strong>{x.description || "Belge"}</strong><div className="page-sub">{x.attachment_versions?.length || 0} sürüm</div></div><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{(x.attachment_versions ?? []).sort((a: any, b: any) => b.version_number - a.version_number).map((z: any) => <span key={z.id} style={{display:"inline-flex",gap:5,alignItems:"center"}}><span className="page-sub">{z.original_filename}</span><a href={`/api/attachments/version/${z.id}`} target="_blank" className="btn btn-secondary">Görüntüle</a><a href={`/api/attachments/version/${z.id}?download=1`} className="btn btn-secondary">İndir</a></span>)}</div></div>)}{!vehicleAttachments.length ? <div className="empty">Henüz araç dosyası yüklenmedi.</div> : null}</div></div></section>
      <section className="card" style={{ gridColumn: "1/-1" }}><div className="section-head"><div><div className="section-title">Trafik Cezaları</div><div className="page-sub">Ceza kaydı, ödeme durumu ve makbuz/dekont belgeleri birlikte yönetilir.</div></div></div><div className="section-body">
        <form action={addFine}><div className="form-grid"><div className="field"><label>Ceza Tarihi *</label><input name="fine_date" type="date" className="input" max={today} required/></div><div className="field"><label>Sürücü</label><input name="driver" className="input"/></div><div className="field"><label>Ceza Türü *</label><input name="fine_type" className="input" required/></div><div className="field"><label>Tutar *</label><input name="amount" type="number" min="0" step="0.01" className="input" required/></div><div className="field"><label>Ödeme</label><select name="payment_status" className="select"><option value="UNPAID">Ödenmedi</option><option value="PAID">Ödendi</option></select></div><div className="field"><label>Açıklama</label><input name="description" className="input"/></div></div><div className="form-actions"><SubmitButton>Ceza Kaydet</SubmitButton></div></form>
        <div className="table-wrap section"><table className="table"><thead><tr><th>Tarih</th><th>Sürücü</th><th>Tür</th><th>Tutar</th><th>Ödeme / Açıklama</th><th>Belgeler</th></tr></thead><tbody>{fines.map((x: any) => {const files=(fineFilesByRecord.get(x.id)??[]);return <tr key={x.id}><td>{formatDate(x.fine_date)}</td><td>{x.driver || "—"}</td><td>{x.fine_type}</td><td>{formatCurrency(x.amount)}</td><td><form action={updateFine} className="inline-return-form"><input type="hidden" name="fine_id" value={x.id}/><select className="select" name="payment_status" defaultValue={x.payment_status||"UNPAID"}><option value="UNPAID">Ödenmedi</option><option value="PAID">Ödendi</option></select><input className="input" type="date" name="payment_date" defaultValue={x.payment_date||""}/><input className="input" name="description" defaultValue={x.description||""} placeholder="Açıklama"/><SubmitButton className="btn btn-secondary">Güncelle</SubmitButton></form></td><td><div className="fine-files">{files.flatMap((a:any)=>(a.attachment_versions??[]).sort((aa:any,bb:any)=>bb.version_number-aa.version_number).slice(0,1).map((ver:any)=><div className="fine-file-row" key={ver.id}><div><strong>{a.description||"Ceza Belgesi"}</strong><div className="page-sub">{ver.original_filename}</div></div><div className="row-actions"><a className="btn btn-secondary" href={`/api/attachments/version/${ver.id}`} target="_blank">Görüntüle</a><a className="btn btn-secondary" href={`/api/attachments/version/${ver.id}?download=1`}>İndir</a><form action={`/api/attachments/${a.id}/delete`} method="post"><input type="hidden" name="return_to" value={`/araclar/${id}/dosyalar`}/><button className="btn btn-danger" type="submit">Sil</button></form></div></div>))}</div><form action="/api/attachments" method="post" encType="multipart/form-data" className="fine-upload-form"><input type="hidden" name="entity_type" value="traffic_fine"/><input type="hidden" name="entity_id" value={x.id}/><input type="hidden" name="return_to" value={`/araclar/${id}/dosyalar`}/><select name="description" className="select" defaultValue="Ceza Belgesi / Makbuz"><option>Ceza Belgesi / Makbuz</option><option>Ödeme Dekontu</option></select><input type="file" name="file" className="input compact-file" accept=".pdf,.jpg,.jpeg,.png" required/><button className="btn btn-secondary" type="submit">Belge Ekle</button></form></td></tr>})}</tbody></table>{!fines.length?<div className="empty">Trafik cezası kaydı bulunmuyor.</div>:null}</div>
      </div></section>
    </div>}

    {tab === "history" && <><section className="card section"><div className="section-head"><div><div className="section-title">Araç Geçmişi / Hareketler</div><div className="page-sub">En yeni işlem en üstte gösterilir. Aynı zamandaki kayıtlar kalıcı kayıt ID'si ile deterministik sıralanır.</div></div></div><div className="section-body"><div className="timeline vehicle-timeline">{events.map((e, i) => <div className={`timeline-row timeline-${e.kind}`} key={`${e.kind}-${e.key||e.date}-${i}`}><div className="timeline-date">{formatDateTime(e.createdAt||e.date)}</div><div className="timeline-line"><span className="timeline-dot"/></div><div className="timeline-content"><div className="timeline-kind">{e.kind.replaceAll("-"," ")}</div><strong>{e.title}</strong><span>{e.desc||"—"}</span></div></div>)}{!events.length ? <div className="empty">Bu araç için henüz hareket kaydı bulunmuyor.</div> : null}</div></div></section><section className="card section table-wrap"><div className="section-head"><div><div className="section-title">Araç Kullanım Geçmişi</div><div className="page-sub">Günlük / kısa süreli teslimlerde aracı kullanan personel ve kilometre geçmişi.</div></div></div><table className="table"><thead><tr><th>Personel</th><th>Teslim</th><th>İade</th><th>Teslim KM</th><th>İade KM</th><th>Amaç / Açıklama</th></tr></thead><tbody>{usageRows.map((x:any)=><tr key={x.id}><td><Link className="link-primary" href={`/personel-yonetimi/${x.personnel_id}`}>{x.personnel_name_snapshot}</Link><PersonnelSnapshot value={x.personnel_snapshot}/></td><td>{formatDateTime(x.checkout_at)}</td><td>{formatDateTime(x.return_at)}</td><td>{x.checkout_km_known?formatNumber(x.checkout_odometer):"—"}</td><td>{x.return_odometer!=null?formatNumber(x.return_odometer):"—"}</td><td>{x.purpose||"—"}{x.description?<div className="page-sub">{x.description}</div>:null}</td></tr>)}</tbody></table>{!usageRows.length?<div className="empty">Günlük araç kullanım kaydı bulunmuyor.</div>:null}</section><section className="card section table-wrap"><div className="section-head"><div><div className="section-title">İşlem Denetim Kayıtları</div><div className="page-sub">İşlemi yapan kullanıcı, tarih/saat ve değişen değerler.</div></div></div><table className="table"><thead><tr><th>Tarih / Saat</th><th>Kullanıcı</th><th>İşlem</th><th>Kayıt</th><th>Değişiklik</th></tr></thead><tbody>{auditRows.map((a:any)=><tr key={a.id}><td>{formatDateTime(a.created_at)}</td><td>{a.user_name_snapshot||"Sistem"}</td><td>{a.action}</td><td>{a.entity_reference||a.module||"—"}</td><td style={{maxWidth:620,whiteSpace:"normal"}}>{auditChangeSummary(a.old_values,a.new_values)}{a.description?<div className="page-sub">{a.description}</div>:null}</td></tr>)}</tbody></table>{!auditRows.length?<div className="empty"><strong>Denetim kaydı bulunmuyor</strong>Yeni işlemler kullanıcı ve zaman bilgisiyle burada tutulacaktır.</div>:null}</section></>}
  </>;
}
