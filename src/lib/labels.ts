export const vehicleStatusLabel: Record<string,string> = {
  ACTIVE: "Boşta",
  ASSIGNED: "Zimmetli",
  TEMP_IN_USE: "Geçici Kullanımda",
  MAINTENANCE: "Bakımda",
  SERVICE: "Serviste",
  DAMAGED: "Hasarlı",
  INACTIVE: "Kullanım Dışı",
  REPLACEMENT: "İkame",
};

export const maintenanceStatusLabel: Record<string,string> = {
  PLANNED: "Planlandı",
  APPOINTMENT_SET: "Randevu Alındı",
  IN_SERVICE: "Serviste",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal",
};

export const accidentStatusLabel: Record<string,string> = {
  NEW: "Yeni",
  DOCUMENTS_PENDING: "Evrak Bekleniyor",
  EXPERT_PENDING: "Eksper Bekleniyor",
  IN_SERVICE: "Serviste",
  INSURANCE_PROCESS: "Sigorta Sürecinde",
  COMPLETED: "Tamamlandı",
  CLOSED: "Kapandı",
};

export const damageStatusLabel: Record<string,string> = {
  NEW: "Yeni",
  OPEN: "Açık",
  IN_SERVICE: "Serviste",
  COMPLETED: "Tamamlandı",
  CLOSED: "Kapandı",
};

export const documentTypeLabel: Record<string,string> = {
  INSPECTION: "Muayene",
  TRAFFIC_INSURANCE: "Trafik Sigortası",
  CASCO: "Kasko",
  PARKING: "Otopark",
  COMPREHENSIVE_INSURANCE: "Kasko",
};

export const paymentStatusLabel: Record<string,string> = {
  UNPAID: "Ödenmedi",
  PAID: "Ödendi",
};

export const tireTypeLabel: Record<string,string> = {
  SUMMER: "Yazlık",
  WINTER: "Kışlık",
  ALL_SEASON: "Dört Mevsim",
};

export const tireTransactionLabel: Record<string,string> = {
  INSTALLED: "Takıldı",
  REMOVED: "Söküldü",
  REPLACED: "Değiştirildi",
  SENT_TO_STORAGE: "Depoya Gönderildi",
  TAKEN_FROM_STORAGE: "Depodan Alındı",
  SCRAPPED: "Hurdaya Ayrıldı",
};

export const taskStatusLabel: Record<string,string> = {
  WAITING: "Bekliyor",
  IN_PROGRESS: "Devam Ediyor",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal",
};

export const priorityLabel: Record<string,string> = {
  LOW: "Düşük",
  NORMAL: "Normal",
  HIGH: "Yüksek",
  URGENT: "Acil",
};

export const notificationSeverityLabel: Record<string,string> = {
  INFO: "Bilgi",
  MEDIUM: "Yaklaşıyor",
  HIGH: "Yaklaşıyor",
  CRITICAL: "Kritik",
};

const moduleMap: Record<string,string> = {
  VEHICLES: "Araçlar",
  vehicles: "Araçlar",
  vehicle: "Araçlar",
  MAINTENANCE: "Bakım / Servis",
  vehicle_maintenance: "Bakım / Servis",
  vehicle_service_records: "Servis / İkame",
  ASSIGNMENTS: "Araç Zimmetleri",
  vehicle_assignments: "Araç Zimmetleri",
  DOCUMENTS: "Belgeler",
  vehicle_compliance_documents: "Araç Belgeleri",
  DAMAGES: "Hasar Kayıtları",
  vehicle_damages: "Hasar Kayıtları",
  ACCIDENTS: "Kaza Kayıtları",
  vehicle_accidents: "Kaza Kayıtları",
  vehicle_accident_updates: "Kaza Gelişmeleri",
  TIRES: "Lastik Yönetimi",
  vehicle_tire_transactions: "Lastik Yönetimi",
  vehicle_traffic_fines: "Trafik Cezaları",
  vehicle_usage_records: "Araç Kullanım / Teslim",
  vehicle_rental_contracts: "Kiralama Sözleşmeleri",
  vehicle_replacement_records: "İkame Araçlar",
  personnel: "Personel Yönetimi",
  equipment: "Envanter Yönetimi",
  personnel_assignments: "Ekipman Zimmetleri",
  TASKS: "Görevler",
  tasks: "Görevler",
  task_comments: "Görev Yorumları",
  USERS: "Kullanıcılar",
  users: "Kullanıcılar",
  attachments: "Dosyalar",
  attachment_versions: "Dosya Sürümleri",
  "Araç": "Araçlar",
};

const actionMap: Record<string,string> = {
  INSERT: "Oluşturuldu",
  UPDATE: "Güncellendi",
  DELETE: "Silindi",
  CREATED: "Oluşturuldu",
  UPDATED: "Güncellendi",
  DEACTIVATED: "Pasife Alındı",
  CREATED_FILE: "Dosya Yüklendi",
  "Oluşturuldu": "Oluşturuldu",
  "Güncellendi": "Güncellendi",
  "KM Güncellendi": "KM Güncellendi",
  "Araç Teslim Edildi": "Araç Teslim Edildi",
  "Araç İade Edildi": "Araç İade Edildi",
  "Dosya Yüklendi": "Dosya Yüklendi",
};

const entityMap: Record<string,string> = {
  vehicle: "Araç",
  vehicles: "Araç",
  vehicle_accidents: "Kaza Dosyası",
  accident: "Kaza Dosyası",
  vehicle_damages: "Hasar Kaydı",
  vehicle_maintenance: "Bakım Kaydı",
  vehicle_service_records: "Servis / İkame Kaydı",
  vehicle_assignments: "Araç Zimmeti",
  assignment: "Araç Zimmeti",
  vehicle_compliance_documents: "Araç Belgesi",
  vehicle_tire_transactions: "Lastik İşlemi",
  vehicle_traffic_fines: "Trafik Cezası",
  vehicle_usage_records: "Araç Kullanım Kaydı",
  vehicle_rental_contract: "Kiralık Araç Sözleşmesi",
  vehicle_rental_contracts: "Kiralık Araç Sözleşmesi",
  vehicle_replacement_records: "İkame Araç Kaydı",
  personnel: "Personel",
  equipment: "Ekipman",
  personnel_assignments: "Ekipman Zimmeti",
  task: "Görev",
  tasks: "Görev",
  user: "Kullanıcı",
  users: "Kullanıcı",
  attachment: "Dosya",
  attachments: "Dosya",
};

export function uiLabel(value: unknown, map: Record<string,string>) {
  const key = String(value ?? "");
  return map[key] ?? (key || "—");
}

export function moduleLabel(value: unknown) { return uiLabel(value, moduleMap); }
export function actionLabel(value: unknown) { return uiLabel(value, actionMap); }
export function entityLabel(value: unknown) { return uiLabel(value, entityMap); }
