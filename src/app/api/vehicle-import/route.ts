import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Workbook } from "exceljs";
import { getCurrentUser } from "@/lib/local/auth";
import { getDatabase } from "@/lib/local/database";
import { localRedirectUrl } from "@/lib/local/redirect-url";
import { sameOrigin } from "@/lib/security";
import { auditAction } from "@/lib/audit";
import { syncVehicleRentalContract } from "@/lib/rental-contract-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const aliases: Record<string, string> = {
  "plaka": "plate", "marka": "brand", "model": "model", "model yılı": "model_year", "model yili": "model_year",
  "araç tipi": "vehicle_type", "arac tipi": "vehicle_type", "mülkiyet tipi": "ownership_type", "mulkiyet tipi": "ownership_type",
  "filo / özmal bilgisi": "ownership_type", "filo/özmal": "ownership_type", "filo / ozmal bilgisi": "ownership_type",
  "şasi numarası": "vin", "sasi numarasi": "vin", "ruhsat seri no": "registration_serial_no", "tescil tarihi": "registration_date",
  "lastik depo bayisi": "tire_storage_dealer", "araç durumu": "status", "arac durumu": "status", "sorumlu kişi": "responsible_person",
  "sorumlu kisi": "responsible_person", "güncel km": "current_odometer", "guncel km": "current_odometer",
  "filo / kiralama şirketi": "fleet_company", "filo / kiralama sirketi": "fleet_company", "filo şirketi": "fleet_company", "filo sirketi": "fleet_company",
  "sözleşme başlangıç tarihi": "contract_start_date", "sozlesme başlangıç tarihi": "contract_start_date", "sozlesme baslangic tarihi": "contract_start_date",
  "sözleşme bitiş tarihi": "contract_end_date", "sozlesme bitis tarihi": "contract_end_date", "sözleşme km limiti": "contract_km_limit", "sozlesme km limiti": "contract_km_limit", "sözleşme maksimum km": "contract_km_limit", "sozlesme maksimum km": "contract_km_limit", "maksimum teslim km": "contract_km_limit",
  "sözleşme referans / araç no": "contract_reference", "sozlesme referans / arac no": "contract_reference", "iade planlanan tarih": "planned_return_date",
  "açıklama": "fleet_description", "aciklama": "fleet_description"
};

function scalar(v: any): any {
  if (v == null) return "";
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v && v.result != null) return scalar(v.result);
    if ("text" in v && v.text != null) return v.text;
    if (Array.isArray(v.richText)) return v.richText.map((x: any) => x.text || "").join("");
  }
  return v;
}
function norm(v: any) { const x = scalar(v); return x instanceof Date ? x.toISOString() : String(x ?? "").trim(); }
function headerKey(v: any) { return norm(v).toLocaleLowerCase("tr-TR").replace(/\s+/g, " "); }
function plate(v: any) { return norm(v).toLocaleUpperCase("tr-TR").replace(/\s+/g, " ").trim(); }
function vin(v: any) { return norm(v).toUpperCase().replace(/\s+/g, ""); }
function ownership(v: any) { const s = norm(v).toLocaleUpperCase("tr-TR"); if (["FİLO", "FILO", "FLEET", "KİRALIK", "KIRALIK"].includes(s)) return "FLEET"; if (["ÖZMAL", "OZMAL", "OWNED", "ÖZ MAL", "OZ MAL"].includes(s)) return "OWNED"; return ""; }
function vehicleStatus(v: any) { const s = norm(v).toLocaleUpperCase("tr-TR"); const map: Record<string, string> = { "BOŞTA": "ACTIVE", "BOSTA": "ACTIVE", "ACTIVE": "ACTIVE", "AKTİF": "ACTIVE", "AKTIF": "ACTIVE", "BAKIMDA": "MAINTENANCE", "SERVİSTE": "SERVICE", "SERVISTE": "SERVICE", "HASARLI": "DAMAGED", "KULLANIM DIŞI": "INACTIVE", "KULLANIM DISI": "INACTIVE" }; return map[s] || ""; }
function excelDate(v: any): { value: string | null; valid: boolean } {
  const raw = scalar(v);
  if (raw == null || raw === "") return { value: null, valid: true };
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return { value: raw.toISOString().slice(0, 10), valid: true };
  const s = String(raw).trim();
  if (!s) return { value: null, valid: true };
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { value: s, valid: !Number.isNaN(new Date(`${s}T00:00:00`).getTime()) };
  const m = s.match(/^(\d{1,2})[.\/]([0-9]{1,2})[.\/]([0-9]{4})$/);
  if (m) { const x = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; return { value: x, valid: !Number.isNaN(new Date(`${x}T00:00:00`).getTime()) }; }
  return { value: null, valid: false };
}
function displayField(key: string) {
  const labels: Record<string, string> = { plate: "Plaka", brand: "Marka", model: "Model", model_year: "Model Yılı", vehicle_type: "Araç Tipi", ownership_type: "Mülkiyet Tipi", current_odometer: "Güncel KM", status: "Araç Durumu", tire_storage_dealer: "Lastik Depo Bayisi" };
  return labels[key] || key;
}
function redirectResult(req: NextRequest, params: { result?: string; error?: string; detail?: string }) {
  const u = localRedirectUrl(req, "/araclar/excel-yukle");
  if (params.result) u.searchParams.set("result", params.result);
  if (params.error) u.searchParams.set("error", params.error);
  if (params.detail) u.searchParams.set("detail", params.detail);
  return NextResponse.redirect(u, 303);
}
function parseErrorMessage(e: unknown) {
  const raw = e instanceof Error ? e.message : String(e || "");
  return raw.replace(/[\r\n\t]+/g, " ").slice(0, 240) || "Bilinmeyen Excel okuma hatası";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Yetkisiz", { status: 401 });
  const wb = new Workbook();
  const ws = wb.addWorksheet("Araç Şablonu");
  ws.columns = [
    { header: "Plaka", key: "plate", width: 18 }, { header: "Marka", key: "brand", width: 18 }, { header: "Model", key: "model", width: 18 },
    { header: "Model Yılı", key: "year", width: 12 }, { header: "Araç Tipi", key: "type", width: 18 }, { header: "Mülkiyet Tipi", key: "ownership", width: 18 },
    { header: "Şasi Numarası", key: "vin", width: 24 }, { header: "Ruhsat Seri No", key: "regserial", width: 18 }, { header: "Tescil Tarihi", key: "regdate", width: 16 },
    { header: "Güncel KM", key: "km", width: 14 }, { header: "Araç Durumu", key: "status", width: 16 }, { header: "Sorumlu Kişi", key: "responsible", width: 22 },
    { header: "Lastik Depo Bayisi", key: "tire", width: 22 }, { header: "Filo / Kiralama Şirketi", key: "fleet", width: 26 },
    { header: "Sözleşme Başlangıç Tarihi", key: "contractstart", width: 24 }, { header: "Sözleşme Bitiş Tarihi", key: "contractend", width: 22 },
    { header: "Sözleşme KM Limiti", key: "kmlimit", width: 20 }, { header: "Sözleşme Referans / Araç No", key: "reference", width: 28 },
    { header: "İade Planlanan Tarih", key: "plannedreturn", width: 22 }, { header: "Açıklama", key: "description", width: 32 }
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "T1" };

  const example = wb.addWorksheet("Örnek");
  example.addRow(["Plaka", "Marka", "Model", "Model Yılı", "Araç Tipi", "Mülkiyet Tipi", "Şasi Numarası", "Ruhsat Seri No", "Tescil Tarihi", "Güncel KM", "Araç Durumu", "Sorumlu Kişi", "Lastik Depo Bayisi", "Filo / Kiralama Şirketi", "Sözleşme Başlangıç Tarihi", "Sözleşme Bitiş Tarihi", "Sözleşme KM Limiti", "Sözleşme Referans / Araç No", "İade Planlanan Tarih", "Açıklama"]);
  example.addRow(["34 ABC 123", "RENAULT", "MEGANE", 2024, "Sedan", "Filo", "VF1EXAMPLE12345678", "AA 123456", "2024-01-15", 85000, "Boşta", "Ahmet Yılmaz", "CONTINENTAL", "Örnek Filo A.Ş.", "2024-01-15", "2027-01-14", 120000, "FL-001", "2027-01-10", "Bu satır yalnızca örnektir."]);
  example.getRow(1).font = { bold: true };

  const notes = wb.addWorksheet("Açıklamalar");
  notes.addRows([
    ["ARAÇ EXCEL ŞABLONU - KULLANIM NOTLARI", ""],
    ["Veri Girişi", "Araçlarınızı yalnızca 'Araç Şablonu' sayfasına, 2. satırdan başlayarak yazın."],
    ["Zorunlu Alanlar", "Plaka, Marka, Model, Model Yılı, Araç Tipi, Mülkiyet Tipi, Güncel KM, Araç Durumu, Lastik Depo Bayisi"],
    ["Mülkiyet Tipi", "Yalnızca Filo veya Özmal yazın."],
    ["Araç Durumu", "Boşta, Bakımda, Serviste, Hasarlı veya Kullanım Dışı değerlerinden birini kullanın."],
    ["Filo Araç", "Mülkiyet Tipi Filo ise Filo / Kiralama Şirketi alanını doldurun."],
    ["Tarih", "YYYY-AA-GG veya GG.AA.YYYY kullanabilirsiniz."],
    ["Duplicate", "Aynı plaka veya şasi numarası sistemde ya da dosya içinde ikinci kez kullanılamaz."]
  ]);
  notes.getColumn(1).width = 24; notes.getColumn(2).width = 90; notes.getRow(1).font = { bold: true };

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(new Uint8Array(buf), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": 'attachment; filename="Arac_Excel_Sablonu.xlsx"',
    "Cache-Control": "no-store"
  }});
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(localRedirectUrl(req, "/login"), 303);
  if (!sameOrigin(req)) return new NextResponse("Geçersiz istek", { status: 403 });
  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return redirectResult(req, { error: "Excel dosyası seçin." });
  if (file.size > 12 * 1024 * 1024) return redirectResult(req, { error: "Excel dosyası 12 MB'dan büyük olamaz." });
  if (!file.name.toLocaleLowerCase("tr-TR").endsWith(".xlsx")) return redirectResult(req, { error: "Yalnızca .xlsx uzantılı Excel dosyası yükleyebilirsiniz." });

  let wb: Workbook;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      return redirectResult(req, { error: "Seçilen dosya gerçek bir .xlsx dosyası değil. Portal üzerindeki güncel Excel şablonunu indirip tekrar deneyin." });
    }
    wb = new Workbook();
    await wb.xlsx.load(bytes as any);
  } catch (e) {
    console.error("VEHICLE_IMPORT_EXCEL_READ_ERROR", e);
    return redirectResult(req, {
      error: "Excel dosyası okunamadı. Portal üzerindeki güncel Excel şablonunu indirip tekrar deneyin.",
      detail: `Excel okuma ayrıntısı: ${parseErrorMessage(e)}`
    });
  }

  const ws = wb.getWorksheet("Araç Şablonu") || wb.worksheets[0];
  if (!ws) return redirectResult(req, { error: "Excel çalışma sayfası bulunamadı." });

  const header: Record<number, string> = {};
  ws.getRow(1).eachCell((c, col) => { const k = aliases[headerKey(c.value)]; if (k) header[col] = k; });
  const required = ["plate", "brand", "model", "model_year", "vehicle_type", "ownership_type", "current_odometer", "status", "tire_storage_dealer"];
  const missing = required.filter((r) => !Object.values(header).includes(r));
  if (missing.length) return redirectResult(req, { error: `Excel şablonu uyumsuz. Eksik zorunlu sütunlar: ${missing.map(displayField).join(", ")}. Portal üzerindeki güncel örnek şablonu kullanın.` });

  const db = getDatabase();
  const existingRows = db.prepare("SELECT plate,vin FROM vehicles").all() as any[];
  const dbPlates = new Set(existingRows.map((x) => plate(x.plate)).filter(Boolean));
  const dbVins = new Set(existingRows.map((x) => vin(x.vin)).filter(Boolean));
  const seenPlates = new Set<string>();
  const seenVins = new Set<string>();
  const valid: any[] = [];
  const errors: string[] = [];

  for (let n = 2; n <= ws.rowCount; n++) {
    const row = ws.getRow(n); const raw: any = {};
    for (const [col, key] of Object.entries(header)) raw[key] = row.getCell(Number(col)).value;
    if (!Object.values(raw).some((v) => norm(v))) continue;

    const pl = plate(raw.plate), chassis = vin(raw.vin), own = ownership(raw.ownership_type), st = vehicleStatus(raw.status);
    const yrText = norm(raw.model_year), kmText = norm(raw.current_odometer), yr = Number(yrText), km = Number(kmText);
    const reg = excelDate(raw.registration_date), contractStart = excelDate(raw.contract_start_date), contractEnd = excelDate(raw.contract_end_date), plannedReturn = excelDate(raw.planned_return_date);
    const errs: string[] = [];

    if (!pl) errs.push("Plaka alanı boş bırakılamaz");
    else if (pl.length < 5 || pl.length > 15 || !/^\d{2}[ A-Z0-9ÇĞİÖŞÜ]+$/u.test(pl)) errs.push("Plaka formatı geçersiz");
    if (pl && seenPlates.has(pl)) errs.push(`Dosya içinde aynı plaka tekrar ediyor (${pl})`);
    if (pl && dbPlates.has(pl)) errs.push(`Plaka sistemde zaten kayıtlı (${pl})`);
    if (pl) seenPlates.add(pl);

    if (chassis && seenVins.has(chassis)) errs.push(`Dosya içinde aynı şasi numarası tekrar ediyor (${chassis})`);
    if (chassis && dbVins.has(chassis)) errs.push(`Şasi numarası sistemde zaten kayıtlı (${chassis})`);
    if (chassis) seenVins.add(chassis);

    if (!norm(raw.brand)) errs.push("Marka alanı boş bırakılamaz");
    if (!norm(raw.model)) errs.push("Model alanı boş bırakılamaz");
    if (!yrText || !Number.isInteger(yr) || yr < 1950 || yr > new Date().getFullYear() + 1) errs.push("Model yılı geçersiz");
    if (!norm(raw.vehicle_type)) errs.push("Araç tipi alanı boş bırakılamaz");
    if (!own) errs.push("Mülkiyet tipi Filo veya Özmal olmalıdır");
    if (!kmText || !Number.isFinite(km) || km < 0) errs.push("Kilometre alanı sayısal ve 0 veya daha büyük olmalıdır");
    if (!st) errs.push("Araç durumu geçersiz. Boşta, Bakımda, Serviste, Hasarlı veya Kullanım Dışı kullanın");
    if (!norm(raw.tire_storage_dealer)) errs.push("Lastik depo bayisi boş bırakılamaz");
    if (own === "FLEET" && !norm(raw.fleet_company)) errs.push("Filo aracında Filo / Kiralama Şirketi zorunludur");
    if (!reg.valid) errs.push("Tescil tarihi geçersiz (GG.AA.YYYY veya YYYY-AA-GG kullanın)");
    if (!contractStart.valid) errs.push("Sözleşme başlangıç tarihi geçersiz");
    if (!contractEnd.valid) errs.push("Sözleşme bitiş tarihi geçersiz");
    if (!plannedReturn.valid) errs.push("İade planlanan tarih geçersiz");
    const kmLimitText = norm(raw.contract_km_limit); const kmLimit = kmLimitText ? Number(kmLimitText) : null;
    if (kmLimitText && (!Number.isFinite(kmLimit) || Number(kmLimit) <= 0)) errs.push("Sözleşme KM limiti 0'dan büyük sayısal değer olmalıdır");
    if (own === "FLEET") {
      const anyContract = Boolean(contractStart.value || contractEnd.value || kmLimitText);
      if (anyContract && (!contractStart.value || !contractEnd.value || kmLimit == null)) errs.push("Sözleşme başlangıç tarihi, bitiş tarihi ve KM limiti birlikte girilmelidir");
      const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      if (contractStart.value && contractStart.value > todayLocal) errs.push("Sözleşme başlangıç tarihi bugünün tarihinden ileri olamaz");
      if (contractStart.value && contractEnd.value && contractEnd.value <= contractStart.value) errs.push("Sözleşme bitiş tarihi başlangıç tarihinden sonra olmalıdır");
    }

    if (errs.length) { errors.push(`Satır ${n} – ${errs.join("; ")}.`); continue; }
    valid.push({
      id: randomUUID(), plate: pl, brand: norm(raw.brand), model: norm(raw.model), model_year: yr, vehicle_type: norm(raw.vehicle_type), ownership_type: own,
      vin: chassis || null, registration_serial_no: norm(raw.registration_serial_no) || null, registration_date: reg.value, current_odometer: km,
      responsible_person: norm(raw.responsible_person) || null, status: st, tire_storage_dealer: norm(raw.tire_storage_dealer),
      fleet_company: own === "FLEET" ? norm(raw.fleet_company) : null, contract_start_date: contractStart.value, contract_end_date: contractEnd.value,
      contract_km_limit: kmLimit, contract_reference: norm(raw.contract_reference) || null, planned_return_date: plannedReturn.value,
      fleet_description: norm(raw.fleet_description) || null
    });
  }

  if (!valid.length && errors.length) return redirectResult(req, { error: "Excel içindeki hiçbir satır doğrulamadan geçmedi. Aşağıdaki hataları düzeltip tekrar yükleyin.", detail: errors.slice(0, 100).join("\n") });
  if (!valid.length) return redirectResult(req, { error: "Excel dosyasında yüklenecek araç satırı bulunamadı." });

  const now = new Date().toISOString();
  try {
    db.exec("BEGIN IMMEDIATE");
    const stmt = db.prepare(`INSERT INTO vehicles(id,plate,ownership_type,brand,model,model_year,vehicle_type,vin,registration_serial_no,registration_date,current_odometer,responsible_person,status,tire_storage_dealer,fleet_company,contract_start_date,contract_end_date,contract_km_limit,contract_reference,planned_return_date,fleet_description,is_active,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)`);
    const hist = db.prepare("INSERT INTO vehicle_status_history(id,vehicle_id,old_status,new_status,description,changed_by,changed_at) VALUES(?,?,NULL,?,'Excel ile araç oluşturuldu',?,?)");
    for (const x of valid) {
      stmt.run(x.id,x.plate,x.ownership_type,x.brand,x.model,x.model_year,x.vehicle_type,x.vin,x.registration_serial_no,x.registration_date,x.current_odometer,x.responsible_person,x.status,x.tire_storage_dealer,x.fleet_company,x.contract_start_date,x.contract_end_date,x.contract_km_limit,x.contract_reference,x.planned_return_date,x.fleet_description,user.id,user.id,now,now);
      hist.run(randomUUID(),x.id,x.status,user.id,now);
      syncVehicleRentalContract(db,x.id,user.id);
    }
    db.exec("COMMIT");
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch {}
    console.error("VEHICLE_IMPORT_DB_ERROR", e);
    const msg = parseErrorMessage(e);
    const friendly = /UNIQUE|constraint|23505/i.test(msg)
      ? "Yükleme sırasında duplicate plaka veya şasi numarası tespit edildi. Güvenlik nedeniyle bu yüklemedeki geçerli satırlar kaydedilmedi."
      : "Araçlar veritabanına kaydedilemedi. Güvenlik nedeniyle bu yüklemedeki geçerli satırlar kaydedilmedi.";
    return redirectResult(req, { error: friendly, detail: `Veritabanı ayrıntısı: ${msg}${errors.length ? `\n\nDiğer satır hataları:\n${errors.slice(0, 80).join("\n")}` : ""}` });
  }

  auditAction(user, "Excel ile Araç Yüklendi", "vehicle_import", randomUUID(), "Toplu araç yükleme", null, { imported: valid.length, failed: errors.length });
  const result = errors.length
    ? `${valid.length} araç başarıyla eklendi, ${errors.length} satır hatalı olduğu için eklenmedi. Geçerli satırlar tek transaction içinde kaydedildi.`
    : `${valid.length} araç başarıyla eklendi. Tüm satırlar doğrulamadan geçti.`;
  return redirectResult(req, { result, detail: errors.slice(0, 100).join("\n") || undefined });
}
