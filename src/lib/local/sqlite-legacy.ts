import { upgradeV212 } from "./upgrade-v212";
import { upgradeV106 } from "./upgrade-v106";
import { upgradeV107 } from "./upgrade-v107";
import { upgradeV23 } from "./upgrade-v23";
import { upgradeV24 } from "./upgrade-v24";
import { upgradeV25 } from "./upgrade-v25";
import { upgradeV26 } from "./upgrade-v26";
import { upgradeV27 } from "./upgrade-v27";
import { upgradeV28 } from "./upgrade-v28";
import { upgradeV281 } from "./upgrade-v281";
import { upgradeV29 } from "./upgrade-v29";
import { upgradeV210 } from "./upgrade-v210";
import { upgradeV211 } from "./upgrade-v211";
import { upgradeV2112 } from "./upgrade-v2112";
import { upgradeV2113 } from "./upgrade-v2113";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

let instance: DatabaseSync | null = null;
function abs(value:string|undefined,fallback:string){const raw=(value||fallback).trim();return path.isAbsolute(raw)?raw:path.resolve(process.cwd(),raw)}
export function getDataDir(){return abs(process.env.PORTAL_DATA_DIR,"./storage")}
export function getUploadDir(){return abs(process.env.PORTAL_UPLOAD_DIR,path.join(getDataDir(),"uploads"))}
export function getBackupDir(){return abs(process.env.PORTAL_BACKUP_DIR,path.join(getDataDir(),"backups"))}

const schema=String.raw`
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,first_name TEXT,last_name TEXT,username TEXT NOT NULL UNIQUE COLLATE NOCASE,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password_hash TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1,role TEXT NOT NULL DEFAULT 'USER',last_login_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,token_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,last_seen_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE TABLE IF NOT EXISTS login_attempts(id TEXT PRIMARY KEY,identifier TEXT NOT NULL,ip_address TEXT,success INTEGER NOT NULL DEFAULT 0,attempted_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_login_attempts_window ON login_attempts(identifier,ip_address,attempted_at DESC);
CREATE TABLE IF NOT EXISTS vehicles(id TEXT PRIMARY KEY,plate TEXT NOT NULL UNIQUE COLLATE NOCASE,ownership_type TEXT NOT NULL,brand TEXT NOT NULL,model TEXT NOT NULL,model_year INTEGER NOT NULL,vehicle_type TEXT NOT NULL,fuel_type TEXT,transmission TEXT,color TEXT,vin TEXT UNIQUE COLLATE NOCASE,engine_number TEXT,registration_serial_no TEXT,registration_document_no TEXT,registration_date TEXT,current_odometer INTEGER NOT NULL DEFAULT 0,responsible_person TEXT,status TEXT NOT NULL DEFAULT 'ACTIVE',tire_storage_dealer TEXT NOT NULL,fleet_company TEXT,contract_start_date TEXT,contract_end_date TEXT,contract_km_limit INTEGER,contract_reference TEXT,planned_return_date TEXT,fleet_description TEXT,rental_tracking_enabled INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1,created_by TEXT REFERENCES users(id),updated_by TEXT REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(plate);CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);CREATE INDEX IF NOT EXISTS idx_vehicles_ownership ON vehicles(ownership_type);CREATE INDEX IF NOT EXISTS idx_vehicles_fleet_company ON vehicles(fleet_company);
CREATE TABLE IF NOT EXISTS vehicle_odometer_history(id TEXT PRIMARY KEY,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),previous_odometer INTEGER NOT NULL,new_odometer INTEGER NOT NULL,is_correction INTEGER NOT NULL DEFAULT 0,correction_reason TEXT,description TEXT,recorded_by TEXT REFERENCES users(id),recorded_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_odo_vehicle_date ON vehicle_odometer_history(vehicle_id,recorded_at DESC);
CREATE TABLE IF NOT EXISTS vehicle_assignments(id TEXT PRIMARY KEY,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),assigned_to TEXT NOT NULL,delivered_by TEXT,delivery_date TEXT NOT NULL,delivery_odometer INTEGER,vehicle_condition_delivery TEXT,delivery_description TEXT,return_date TEXT,return_odometer INTEGER,returned_to TEXT,vehicle_condition_return TEXT,return_description TEXT,created_by TEXT REFERENCES users(id),created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_assign_vehicle ON vehicle_assignments(vehicle_id,delivery_date DESC);
CREATE TABLE IF NOT EXISTS vehicle_status_history(id TEXT PRIMARY KEY,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),old_status TEXT,new_status TEXT NOT NULL,description TEXT,changed_by TEXT REFERENCES users(id),changed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vehicle_compliance_documents(id TEXT PRIMARY KEY,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),document_type TEXT NOT NULL,start_date TEXT,end_date TEXT NOT NULL,description TEXT,created_by TEXT REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vehicle_service_appointments(id TEXT PRIMARY KEY,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),planned_date TEXT NOT NULL,service_name TEXT,description TEXT,status TEXT NOT NULL,created_by TEXT REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vehicle_maintenance(id TEXT PRIMARY KEY,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),maintenance_date TEXT NOT NULL,odometer INTEGER,service_name TEXT,maintenance_type TEXT NOT NULL,description TEXT,cost REAL NOT NULL DEFAULT 0,next_maintenance_odometer INTEGER,next_maintenance_date TEXT,status TEXT,created_by TEXT REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vehicle_accidents(id TEXT PRIMARY KEY,file_number TEXT NOT NULL UNIQUE,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),accident_date TEXT NOT NULL,accident_time TEXT,driver TEXT,accident_location TEXT,counterparty_plate TEXT,description TEXT,damage_description TEXT,fault_rate REAL,insurance_company TEXT,insurance_claim_number TEXT,expert_info TEXT,status TEXT NOT NULL DEFAULT 'NEW',estimated_cost REAL DEFAULT 0,actual_cost REAL DEFAULT 0,replacement_vehicle_status TEXT,notes TEXT,created_by TEXT REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vehicle_accident_updates(id TEXT PRIMARY KEY,accident_id TEXT NOT NULL REFERENCES vehicle_accidents(id),note TEXT NOT NULL,created_by TEXT REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vehicle_damages(id TEXT PRIMARY KEY,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),damage_date TEXT NOT NULL,odometer INTEGER,damage_type TEXT NOT NULL,damaged_area TEXT,description TEXT,service_name TEXT,cost REAL DEFAULT 0,status TEXT,replacement_plate TEXT,replacement_received_at TEXT,replacement_returned_at TEXT,replacement_company TEXT,replacement_notes TEXT,created_by TEXT REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_damage_replacement ON vehicle_damages(replacement_plate);
CREATE TABLE IF NOT EXISTS vehicle_tire_transactions(id TEXT PRIMARY KEY,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),transaction_date TEXT NOT NULL,odometer INTEGER,tire_type TEXT,brand TEXT,model TEXT,size TEXT,quantity INTEGER NOT NULL DEFAULT 1,transaction_type TEXT NOT NULL,tire_dealer TEXT,storage_dealer TEXT,description TEXT,cost REAL NOT NULL DEFAULT 0,created_by TEXT REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vehicle_traffic_fines(id TEXT PRIMARY KEY,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),fine_date TEXT NOT NULL,fine_time TEXT,driver TEXT,fine_type TEXT NOT NULL,amount REAL NOT NULL DEFAULT 0,notification_date TEXT,payment_status TEXT NOT NULL DEFAULT 'UNPAID',payment_date TEXT,description TEXT,created_by TEXT REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vehicle_service_records(id TEXT PRIMARY KEY,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),service_in_at TEXT NOT NULL,service_out_at TEXT,service_name TEXT NOT NULL,service_reason TEXT NOT NULL,odometer INTEGER,notes TEXT,cost REAL NOT NULL DEFAULT 0,next_maintenance_date TEXT,next_maintenance_odometer INTEGER,replacement_vehicle_provided INTEGER NOT NULL DEFAULT 0,replacement_plate TEXT,replacement_received_at TEXT,replacement_returned_at TEXT,replacement_company TEXT,replacement_notes TEXT,completion_notes TEXT,previous_vehicle_status TEXT,status TEXT NOT NULL DEFAULT 'OPEN',created_by TEXT REFERENCES users(id),closed_by TEXT REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_service_per_vehicle ON vehicle_service_records(vehicle_id) WHERE status='OPEN';CREATE INDEX IF NOT EXISTS idx_service_replacement ON vehicle_service_records(replacement_plate);
CREATE TABLE IF NOT EXISTS attachments(id TEXT PRIMARY KEY,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,description TEXT,created_by TEXT REFERENCES users(id),created_at TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS attachment_versions(id TEXT PRIMARY KEY,attachment_id TEXT NOT NULL REFERENCES attachments(id),version_number INTEGER NOT NULL,storage_path TEXT NOT NULL,original_filename TEXT NOT NULL,mime_type TEXT NOT NULL,file_size INTEGER NOT NULL,uploaded_by TEXT REFERENCES users(id),uploaded_at TEXT NOT NULL,UNIQUE(attachment_id,version_number));
CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT,assigned_user_id TEXT REFERENCES users(id),start_date TEXT,due_date TEXT,priority TEXT NOT NULL DEFAULT 'NORMAL',status TEXT NOT NULL DEFAULT 'WAITING',created_by TEXT REFERENCES users(id),completed_by TEXT REFERENCES users(id),completed_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS task_comments(id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES tasks(id),comment TEXT NOT NULL,created_by TEXT REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS task_history(id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES tasks(id),action TEXT NOT NULL,old_value TEXT,new_value TEXT,created_by TEXT REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),notification_type TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,reminder_stage TEXT NOT NULL,title TEXT NOT NULL,message TEXT NOT NULL,severity TEXT NOT NULL DEFAULT 'INFO',severity_rank INTEGER NOT NULL DEFAULT 1,is_read INTEGER NOT NULL DEFAULT 0,read_at TEXT,created_at TEXT NOT NULL,UNIQUE(notification_type,entity_type,entity_id,reminder_stage,user_id));
CREATE TABLE IF NOT EXISTS audit_logs(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,user_id TEXT REFERENCES users(id),user_name_snapshot TEXT,module TEXT NOT NULL,action TEXT NOT NULL,entity_type TEXT,entity_id TEXT,entity_reference TEXT,old_values TEXT,new_values TEXT,description TEXT,ip_address TEXT,request_id TEXT);
CREATE TABLE IF NOT EXISTS report_catalog(slug TEXT PRIMARY KEY,name TEXT NOT NULL,report_type TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 100,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS system_settings(setting_key TEXT PRIMARY KEY,setting_value TEXT,setting_label TEXT NOT NULL,updated_by TEXT,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS system_definitions(id TEXT PRIMARY KEY,category TEXT NOT NULL,code TEXT,name TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1,sort_order INTEGER NOT NULL DEFAULT 100,is_system INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(category,name COLLATE NOCASE));
CREATE INDEX IF NOT EXISTS idx_def_category ON system_definitions(category,is_active,sort_order);
CREATE TABLE IF NOT EXISTS alert_settings(setting_key TEXT PRIMARY KEY,label TEXT NOT NULL,days_before INTEGER NOT NULL DEFAULT 30,is_active INTEGER NOT NULL DEFAULT 1,updated_by TEXT,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dashboard_settings(card_key TEXT PRIMARY KEY,label TEXT NOT NULL,is_visible INTEGER NOT NULL DEFAULT 1,sort_order INTEGER NOT NULL DEFAULT 100,updated_by TEXT,updated_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS menu_settings(menu_key TEXT PRIMARY KEY,label TEXT NOT NULL,href TEXT NOT NULL,is_visible INTEGER NOT NULL DEFAULT 1,sort_order INTEGER NOT NULL DEFAULT 100,is_system INTEGER NOT NULL DEFAULT 0,updated_by TEXT,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS personnel(id TEXT PRIMARY KEY,first_name TEXT NOT NULL,last_name TEXT NOT NULL,employee_no TEXT UNIQUE COLLATE NOCASE,department TEXT,title TEXT,status TEXT NOT NULL DEFAULT 'ACTIVE',deleted_at TEXT,created_by TEXT REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_personnel_name ON personnel(last_name,first_name);
CREATE INDEX IF NOT EXISTS idx_personnel_department ON personnel(department,status);
CREATE TABLE IF NOT EXISTS equipment(id TEXT PRIMARY KEY,equipment_type TEXT NOT NULL,brand TEXT,model TEXT,serial_number TEXT,imei TEXT,imei2 TEXT,asset_tag TEXT,screen_size TEXT,device_subtype TEXT,description TEXT,status TEXT NOT NULL DEFAULT 'AVAILABLE',created_by TEXT REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_serial ON equipment(serial_number COLLATE NOCASE) WHERE serial_number IS NOT NULL AND trim(serial_number)<>'';
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_imei ON equipment(imei COLLATE NOCASE) WHERE imei IS NOT NULL AND trim(imei)<>'';
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_imei2 ON equipment(imei2 COLLATE NOCASE) WHERE imei2 IS NOT NULL AND trim(imei2)<>'';
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_asset ON equipment(asset_tag COLLATE NOCASE) WHERE asset_tag IS NOT NULL AND trim(asset_tag)<>'';
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status,equipment_type);
CREATE TABLE IF NOT EXISTS personnel_assignments(id TEXT PRIMARY KEY,personnel_id TEXT NOT NULL REFERENCES personnel(id),equipment_id TEXT NOT NULL REFERENCES equipment(id),assignment_date TEXT NOT NULL,planned_return_date TEXT,return_date TEXT,status TEXT NOT NULL DEFAULT 'ACTIVE',description TEXT,return_note TEXT,created_by TEXT REFERENCES users(id),returned_by TEXT REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_active_assignment ON personnel_assignments(equipment_id) WHERE return_date IS NULL AND status='ACTIVE';
CREATE INDEX IF NOT EXISTS idx_personnel_assignments_person ON personnel_assignments(personnel_id,assignment_date DESC);
CREATE TABLE IF NOT EXISTS vehicle_usage_records(id TEXT PRIMARY KEY,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),personnel_id TEXT NOT NULL REFERENCES personnel(id),personnel_name_snapshot TEXT NOT NULL,department_snapshot TEXT,checkout_at TEXT NOT NULL,checkout_odometer INTEGER NOT NULL,return_at TEXT,return_odometer INTEGER,purpose TEXT,description TEXT,return_note TEXT,status TEXT NOT NULL DEFAULT 'IN_USE',created_by TEXT REFERENCES users(id),returned_by TEXT REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_usage_active ON vehicle_usage_records(vehicle_id) WHERE status='IN_USE' AND return_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vehicle_usage_vehicle_date ON vehicle_usage_records(vehicle_id,checkout_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_usage_person_date ON vehicle_usage_records(personnel_id,checkout_at DESC);
CREATE TABLE IF NOT EXISTS vehicle_replacement_records(id TEXT PRIMARY KEY,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),source_type TEXT NOT NULL,source_id TEXT NOT NULL,replacement_plate TEXT NOT NULL,replacement_received_at TEXT,replacement_returned_at TEXT,replacement_company TEXT,replacement_notes TEXT,status TEXT NOT NULL DEFAULT 'ACTIVE',created_by TEXT REFERENCES users(id),updated_by TEXT REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_replacement_vehicle ON vehicle_replacement_records(vehicle_id,replacement_received_at DESC);
CREATE INDEX IF NOT EXISTS idx_replacement_source ON vehicle_replacement_records(source_type,source_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_replacement_plate ON vehicle_replacement_records(replacement_plate);
CREATE TRIGGER IF NOT EXISTS trg_one_active_replacement_insert BEFORE INSERT ON vehicle_replacement_records WHEN NEW.status='ACTIVE' BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM vehicle_replacement_records WHERE vehicle_id=NEW.vehicle_id AND status='ACTIVE' AND id<>NEW.id) THEN RAISE(ABORT,'ACTIVE_REPLACEMENT_EXISTS') END; END;
CREATE TRIGGER IF NOT EXISTS trg_one_active_replacement_update BEFORE UPDATE OF vehicle_id,status ON vehicle_replacement_records WHEN NEW.status='ACTIVE' BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM vehicle_replacement_records WHERE vehicle_id=NEW.vehicle_id AND status='ACTIVE' AND id<>NEW.id) THEN RAISE(ABORT,'ACTIVE_REPLACEMENT_EXISTS') END; END;
CREATE TRIGGER IF NOT EXISTS trg_case_replacement_no_open_service_insert BEFORE INSERT ON vehicle_replacement_records WHEN NEW.status='ACTIVE' AND NEW.source_type IN ('ACCIDENT','DAMAGE') BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM vehicle_service_records WHERE vehicle_id=NEW.vehicle_id AND status='OPEN') THEN RAISE(ABORT,'OPEN_SERVICE_CONFLICT') END; END;
CREATE TRIGGER IF NOT EXISTS trg_case_replacement_no_open_service_update BEFORE UPDATE OF vehicle_id,source_type,status ON vehicle_replacement_records WHEN NEW.status='ACTIVE' AND NEW.source_type IN ('ACCIDENT','DAMAGE') BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM vehicle_service_records WHERE vehicle_id=NEW.vehicle_id AND status='OPEN') THEN RAISE(ABORT,'OPEN_SERVICE_CONFLICT') END; END;
CREATE TRIGGER IF NOT EXISTS trg_service_no_active_case_insert BEFORE INSERT ON vehicle_service_records WHEN NEW.status='OPEN' BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM vehicle_accidents WHERE vehicle_id=NEW.vehicle_id AND status='IN_SERVICE') OR EXISTS(SELECT 1 FROM vehicle_damages WHERE vehicle_id=NEW.vehicle_id AND status='IN_SERVICE') OR EXISTS(SELECT 1 FROM vehicle_replacement_records WHERE vehicle_id=NEW.vehicle_id AND status='ACTIVE' AND source_type IN ('ACCIDENT','DAMAGE')) THEN RAISE(ABORT,'ACTIVE_DAMAGE_SERVICE_CONFLICT') END; END;
CREATE TRIGGER IF NOT EXISTS trg_service_no_active_case_update BEFORE UPDATE OF vehicle_id,status ON vehicle_service_records WHEN NEW.status='OPEN' BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM vehicle_accidents WHERE vehicle_id=NEW.vehicle_id AND status='IN_SERVICE') OR EXISTS(SELECT 1 FROM vehicle_damages WHERE vehicle_id=NEW.vehicle_id AND status='IN_SERVICE') OR EXISTS(SELECT 1 FROM vehicle_replacement_records WHERE vehicle_id=NEW.vehicle_id AND status='ACTIVE' AND source_type IN ('ACCIDENT','DAMAGE')) THEN RAISE(ABORT,'ACTIVE_DAMAGE_SERVICE_CONFLICT') END; END;
CREATE TRIGGER IF NOT EXISTS trg_accident_in_service_no_open_service_insert BEFORE INSERT ON vehicle_accidents WHEN NEW.status='IN_SERVICE' BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM vehicle_service_records WHERE vehicle_id=NEW.vehicle_id AND status='OPEN') THEN RAISE(ABORT,'OPEN_SERVICE_CONFLICT') END; END;
CREATE TRIGGER IF NOT EXISTS trg_accident_in_service_no_open_service_update BEFORE UPDATE OF vehicle_id,status ON vehicle_accidents WHEN NEW.status='IN_SERVICE' BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM vehicle_service_records WHERE vehicle_id=NEW.vehicle_id AND status='OPEN') THEN RAISE(ABORT,'OPEN_SERVICE_CONFLICT') END; END;
CREATE TRIGGER IF NOT EXISTS trg_damage_in_service_no_open_service_insert BEFORE INSERT ON vehicle_damages WHEN NEW.status='IN_SERVICE' BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM vehicle_service_records WHERE vehicle_id=NEW.vehicle_id AND status='OPEN') THEN RAISE(ABORT,'OPEN_SERVICE_CONFLICT') END; END;
CREATE TRIGGER IF NOT EXISTS trg_damage_in_service_no_open_service_update BEFORE UPDATE OF vehicle_id,status ON vehicle_damages WHEN NEW.status='IN_SERVICE' BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM vehicle_service_records WHERE vehicle_id=NEW.vehicle_id AND status='OPEN') THEN RAISE(ABORT,'OPEN_SERVICE_CONFLICT') END; END;
CREATE TABLE IF NOT EXISTS application_errors(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,area TEXT,error_code TEXT,message TEXT,details TEXT,user_id TEXT REFERENCES users(id));
`;

const reports=[
["vehicle-list","Araç Listesi","TABLO","Araç Raporları","Aktif filo ve özmal araçların genel listesi.",10],
["fleet-vehicles","Filo Dağılımı","TABLO","Araç Raporları","Filo araçları, sözleşme bitişleri ve kilometre limitleri.",20],
["owned-vehicles","Özmal Araçlar","TABLO","Araç Raporları","Şirkete ait özmal araçların güncel listesi.",30],
["vehicle-cost","Araç Maliyetleri","ÖZET","Araç Raporları","Servis/bakım, kaza/hasar, trafik cezası ve lastik maliyetlerinin yıllık özeti.",40],
["maintenance","Servis / Bakım Geçmişi","TABLO","Servis / Bakım Raporları","Bakım ve servis işlemlerinin tarih, durum ve maliyet özeti.",50],
["replacement-history","İkame Araç Geçmişi","TABLO","Servis / Bakım Raporları","Servis, kaza ve hasar kaynaklı ikame araç geçmişi.",60],
["active-vehicle-assignments","Aktif Araç Zimmetleri","TABLO","Zimmet Raporları","Halen iade edilmemiş araç zimmetleri.",70],
["personnel-assignments","Ekipman Zimmetleri","TABLO","Zimmet Raporları","Personel bazlı aktif ekipman zimmetleri.",80],
["accident-damage","Kaza / Hasar Kayıtları","TABLO","Kaza / Hasar Raporları","Kaza dosyaları ve gerçekleşen maliyetlerin özeti.",90],
["active-damage-files","Aktif Hasar Dosyaları","TABLO","Kaza / Hasar Raporları","Henüz tamamlanmamış veya kapanmamış kaza / hasar dosyaları.",100],
["traffic-fines","Trafik Cezası Listesi","TABLO","Trafik Cezaları","Araçlara bağlı trafik cezaları ve ödeme durumları.",110],
["audit-log","İşlem Geçmişi","TABLO","Sistem","Sistem üzerinde gerçekleştirilen kritik işlemlerin salt okunur geçmişi.",120]
];

function hasColumn(db:DatabaseSync,table:string,column:string){return (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).some(x=>x.name===column)}
function addColumn(db:DatabaseSync,table:string,column:string,sql:string){if(!hasColumn(db,table,column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sql}`)}
function seedCoreDefaults(db:DatabaseSync){const n=new Date().toISOString();
  const settings=[
    ["portal_name","İdari İşler Portalı","Portal adı"],["company_name","Nil Global Altın Ticaret A.Ş.","Şirket adı"],["system_description","Operasyon Yönetim Portalı","Sistem açıklaması"],["dashboard_title","Ana Panel","Dashboard başlığı"],
    ["theme_font_family","Urbanist, sans-serif","Yazı tipi"],["theme_base_font_size","14","Ana font boyutu"],["theme_menu_font_size","14","Menü font boyutu"],["theme_table_font_size","14","Tablo font boyutu"],["theme_page_title_size","27","Sayfa başlığı boyutu"],["theme_heading_weight","800","Başlık font ağırlığı"],["theme_button_height","40","Buton yüksekliği"],["theme_input_height","42","Input yüksekliği"],["theme_table_row_padding","12","Tablo satır iç boşluğu"],["theme_card_gap","13","Kart aralığı"],
    ["theme_primary","#17324d","Ana vurgu rengi"],["theme_primary_hover","#0f2539","Ana vurgu hover"],["theme_background","#f5f7fa","Ana arka plan"],["theme_surface","#ffffff","Kart arka planı"],["theme_sidebar","#102a43","Sidebar rengi"],["theme_sidebar_text","#dce7f0","Sidebar yazı rengi"],["theme_active_menu","#244d73","Aktif menü rengi"],["theme_header","#ffffff","Header rengi"],["theme_border","#e3e8ef","Border rengi"],["theme_text","#172033","Ana yazı rengi"],["theme_muted","#667085","İkincil yazı rengi"],["theme_success","#16824b","Başarı rengi"],["theme_warning","#b96200","Uyarı rengi"],["theme_danger","#c73636","Hata rengi"],["theme_card_radius","14","Kart köşe yuvarlaklığı"],["theme_button_radius","10","Buton köşe yuvarlaklığı"],["theme_input_radius","10","Input köşe yuvarlaklığı"],["theme_card_padding","18","Kart iç boşluğu"],["theme_shadow","0 8px 26px rgba(16,42,67,.07)","Kart gölgesi"],["theme_table_zebra","0","Tablo zebra görünümü"]
  ];
  const ss=db.prepare("INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at) VALUES(?,?,?,?) ON CONFLICT(setting_key) DO NOTHING");for(const x of settings)ss.run(...x,n);
  const defs:any[]=[
    ["fleet_company","GARANTI_FILO","Garanti Filo",1,10,0],["fleet_company","VDF_FILO","VDF Filo",1,20,0],
    ["vehicle_type","SEDAN","Sedan",1,10,0],["vehicle_type","SUV","SUV",1,20,0],["vehicle_type","HAFIF_TICARI","Hafif Ticari",1,30,0],
    ["fuel_type","BENZIN","Benzin",1,10,0],["fuel_type","DIZEL","Dizel",1,20,0],["fuel_type","HIBRIT","Hibrit",1,30,0],["fuel_type","ELEKTRIK","Elektrik",1,40,0],
    ["transmission","OTOMATIK","Otomatik",1,10,0],["transmission","MANUEL","Manuel",1,20,0],
    ["document_type","INSPECTION","Muayene",1,10,1],["document_type","TRAFFIC_INSURANCE","Trafik Sigortası",1,20,1],["document_type","CASCO","Kasko",1,30,1],
    ["maintenance_type","PERIODIC","Periyodik Bakım",1,10,0],["maintenance_type","REPAIR","Onarım",1,20,0],
    ["damage_type","ACCIDENT","Kaza",1,10,0],["damage_type","DAMAGE","Hasar",1,20,0],
    ["vehicle_status","ACTIVE","Boşta",1,10,1],["vehicle_status","ASSIGNED","Zimmetli",1,20,1],["vehicle_status","SERVICE","Serviste",1,30,1],["vehicle_status","MAINTENANCE","Bakımda",1,40,1],["vehicle_status","DAMAGED","Hasarda",1,50,1],["vehicle_status","INACTIVE","Kullanım Dışı",1,60,1],
    ["equipment_type","PHONE","Telefon",1,10,0],["equipment_type","TABLET","Tablet",1,20,0],["equipment_type","LAPTOP","Laptop",1,30,0],["equipment_type","DESKTOP","Masaüstü Bilgisayar",1,40,0],["equipment_type","MONITOR","Monitör",1,50,0],["equipment_type","KEYBOARD","Klavye",1,60,0],["equipment_type","MOUSE","Mouse",1,70,0],["equipment_type","HEADSET","Kulaklık",1,80,0],["equipment_type","CHARGER","Şarj Cihazı",1,90,0],["equipment_type","ADAPTER","Adaptör",1,100,0],["equipment_type","SIM","SIM Kart",1,110,0],["equipment_type","MODEM","Modem",1,120,0],["equipment_type","PRINTER","Yazıcı",1,130,0],["equipment_type","OTHER","Diğer",1,999,0],
    ["department","IDARI_ISLER","İdari İşler",1,10,0],["department","FINANS","Finans",1,20,0],["department","INSAN_KAYNAKLARI","İnsan Kaynakları",1,30,0],["department","BILGI_TEKNOLOJILERI","Bilgi Teknolojileri",1,40,0],
    ["personnel_assignment_status","ACTIVE","Aktif Zimmet",1,10,1],["personnel_assignment_status","RETURNED","İade Edildi",1,20,1],["personnel_assignment_status","LOST","Kayıp",1,30,1],["personnel_assignment_status","DAMAGED","Hasarlı",1,40,1],
    ["vehicle_usage_status","IN_USE","Kullanımda",1,10,1],["vehicle_usage_status","COMPLETED","Tamamlandı",1,20,1],
    ["vehicle_usage_purpose","COMPANY_BUSINESS","Şirket İşleri",1,10,0],["vehicle_usage_purpose","BANK","Banka İşleri",1,20,0],["vehicle_usage_purpose","OFFICIAL","Resmî İşlem",1,30,0],["vehicle_usage_purpose","OTHER","Diğer",1,999,0]
  ];
  const sd=db.prepare("INSERT INTO system_definitions(id,category,code,name,is_active,sort_order,is_system,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(category,name) DO NOTHING");for(const x of defs){if(x[0]==="equipment_type"&&db.prepare("SELECT 1 FROM system_definitions WHERE category=? AND code=?").get(x[0],x[1]))continue;sd.run(randomUUID(),...x,n,n);}
  const alerts=[['inspection','Muayene uyarısı',30],['traffic_insurance','Trafik sigortası uyarısı',30],['casco','Kasko uyarısı',30],['maintenance','Bakım uyarısı',15],['fleet_contract','Filo sözleşme uyarısı',30],['task','Görev son tarihi uyarısı',30],['vehicle_status','Kritik araç durumu',0]];
  const sa=db.prepare("INSERT INTO alert_settings(setting_key,label,days_before,is_active,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(setting_key) DO NOTHING");for(const x of alerts)sa.run(...x,n);
  const cards=[['total_vehicles','Toplam Araç',10],['service_vehicles','Servisteki Araç',20],['attention','Dikkat Gerektiren',30],['tasks','Açık Görev',40],['personnel_active_assignments','Aktif Personel Zimmeti',50],['equipment_total','Toplam Ekipman',60],['equipment_due_returns','İade Bekleyen Ekipman',70],['equipment_damaged','Hasarlı Ekipman',80],['fleet_vehicles','Filo Araç',90],['owned_vehicles','Özmal Araç',100],['available_vehicles','Boştaki Araç',110],['assigned_vehicles','Zimmetli Araç',120],['vehicles_in_use','Şu Anda Kullanımda Olan Araçlar',130]];
  const sc=db.prepare("INSERT INTO dashboard_settings(card_key,label,is_visible,sort_order,updated_at) VALUES(?,?,1,?,?) ON CONFLICT(card_key) DO NOTHING");for(const x of cards)sc.run(...x,n);
  const menus:any[]=[
    ["dashboard","Ana Panel","/ana-panel",1,10,1],["vehicles","Araçlar","/araclar",1,20,1],["maintenance","Servis / İkame","/servis-ikame",1,25,1],["accidents","Kaza / Hasar","/kaza-hasar",1,30,0],["tires","Lastik Yönetimi","/lastik-yonetimi",1,40,0],["personnel","Personel Yönetimi","/personel-yonetimi",1,50,1],["personnel_assets","Personel Zimmetleri","/personel-zimmetleri",1,60,1],["vehicle_usage","Araç Kullanım / Teslim","/arac-kullanim-teslim",1,70,1],["tasks","Görevler","/gorevler",1,80,0],["calendar","Takvim","/takvim",1,70,0],["reports","Raporlar","/raporlar",1,80,0],["users","Kullanıcılar","/kullanicilar",1,85,1],["audit","İşlem Geçmişi","/islem-gecmisi",1,90,1]
  ];
  const sm=db.prepare("INSERT INTO menu_settings(menu_key,label,href,is_visible,sort_order,is_system,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(menu_key) DO NOTHING");for(const x of menus)sm.run(...x,n);
}

function installOperationalConflictTriggers(db:DatabaseSync){
  // Eski veritabanlarında farklı trigger tanımları bulunabilir.
  // Her başlangıçta yeniden kurarak Kaza/Hasar <-> Servis/İkame çakışmasını engeller.
  db.exec(`
DROP TRIGGER IF EXISTS trg_service_no_active_case_insert;
DROP TRIGGER IF EXISTS trg_service_no_active_case_update;
DROP TRIGGER IF EXISTS trg_accident_in_service_no_open_service_insert;
DROP TRIGGER IF EXISTS trg_accident_in_service_no_open_service_update;
DROP TRIGGER IF EXISTS trg_damage_in_service_no_open_service_insert;
DROP TRIGGER IF EXISTS trg_damage_in_service_no_open_service_update;
CREATE TRIGGER trg_service_no_active_case_insert BEFORE INSERT ON vehicle_service_records WHEN NEW.status='OPEN' BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM vehicle_accidents WHERE vehicle_id=NEW.vehicle_id AND status='IN_SERVICE')
    OR EXISTS(SELECT 1 FROM vehicle_damages WHERE vehicle_id=NEW.vehicle_id AND status='IN_SERVICE')
    OR EXISTS(SELECT 1 FROM vehicle_replacement_records WHERE vehicle_id=NEW.vehicle_id AND status='ACTIVE' AND source_type IN ('ACCIDENT','DAMAGE'))
  THEN RAISE(ABORT,'ACTIVE_DAMAGE_SERVICE_CONFLICT') END;
END;
CREATE TRIGGER trg_service_no_active_case_update BEFORE UPDATE OF vehicle_id,status ON vehicle_service_records WHEN NEW.status='OPEN' BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM vehicle_accidents WHERE vehicle_id=NEW.vehicle_id AND status='IN_SERVICE')
    OR EXISTS(SELECT 1 FROM vehicle_damages WHERE vehicle_id=NEW.vehicle_id AND status='IN_SERVICE')
    OR EXISTS(SELECT 1 FROM vehicle_replacement_records WHERE vehicle_id=NEW.vehicle_id AND status='ACTIVE' AND source_type IN ('ACCIDENT','DAMAGE'))
  THEN RAISE(ABORT,'ACTIVE_DAMAGE_SERVICE_CONFLICT') END;
END;
CREATE TRIGGER trg_accident_in_service_no_open_service_insert BEFORE INSERT ON vehicle_accidents WHEN NEW.status='IN_SERVICE' BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM vehicle_service_records WHERE vehicle_id=NEW.vehicle_id AND status='OPEN') THEN RAISE(ABORT,'OPEN_SERVICE_CONFLICT') END;
END;
CREATE TRIGGER trg_accident_in_service_no_open_service_update BEFORE UPDATE OF vehicle_id,status ON vehicle_accidents WHEN NEW.status='IN_SERVICE' BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM vehicle_service_records WHERE vehicle_id=NEW.vehicle_id AND status='OPEN') THEN RAISE(ABORT,'OPEN_SERVICE_CONFLICT') END;
END;
CREATE TRIGGER trg_damage_in_service_no_open_service_insert BEFORE INSERT ON vehicle_damages WHEN NEW.status='IN_SERVICE' BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM vehicle_service_records WHERE vehicle_id=NEW.vehicle_id AND status='OPEN') THEN RAISE(ABORT,'OPEN_SERVICE_CONFLICT') END;
END;
CREATE TRIGGER trg_damage_in_service_no_open_service_update BEFORE UPDATE OF vehicle_id,status ON vehicle_damages WHEN NEW.status='IN_SERVICE' BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM vehicle_service_records WHERE vehicle_id=NEW.vehicle_id AND status='OPEN') THEN RAISE(ABORT,'OPEN_SERVICE_CONFLICT') END;
END;
`);
}

function cleanupRemovedFeatures(db:DatabaseSync){
  try{
    db.prepare("DELETE FROM system_settings WHERE setting_key='contact_info'").run();
    const rows=db.prepare("SELECT av.storage_path FROM attachment_versions av JOIN attachments a ON a.id=av.attachment_id WHERE a.entity_type='power_of_attorney'").all() as any[];
    const root=path.resolve(getUploadDir());
    for(const r of rows){try{const full=path.resolve(root,String(r.storage_path||''));if(full.startsWith(root+path.sep))fs.rmSync(full,{force:true})}catch{}}
    db.exec("DELETE FROM attachment_versions WHERE attachment_id IN (SELECT id FROM attachments WHERE entity_type='power_of_attorney'); DELETE FROM attachments WHERE entity_type='power_of_attorney';");
    db.prepare("DELETE FROM notifications WHERE entity_type='power_of_attorney' OR lower(notification_type) LIKE '%vekalet%' OR lower(notification_type) LIKE '%power%'").run();
    db.prepare("DELETE FROM audit_logs WHERE entity_type='power_of_attorney' OR lower(module) LIKE '%vekalet%' OR lower(COALESCE(description,'')) LIKE '%vekalet%'").run();
    db.prepare("DELETE FROM report_catalog WHERE lower(name) LIKE '%vekalet%' OR slug LIKE '%power%'").run();
    db.exec("DROP TABLE IF EXISTS powers_of_attorney");
    try{fs.rmSync(path.join(root,'power_of_attorney'),{recursive:true,force:true})}catch{}
  }catch(e){console.error('REMOVED_FEATURE_CLEANUP_ERROR',e)}
}

function cleanupRemovedManagementInfrastructure(db:DatabaseSync){
  try{
    db.exec(`
      DROP TABLE IF EXISTS portal_automation_runs;
      DROP TABLE IF EXISTS portal_configuration_history;
      DROP TABLE IF EXISTS portal_configuration_releases;
      DROP TABLE IF EXISTS portal_feature_flags;
      DROP TABLE IF EXISTS portal_reports;
      DROP TABLE IF EXISTS portal_automations;
      DROP TABLE IF EXISTS portal_pages;
      DROP TABLE IF EXISTS portal_views;
      DROP TABLE IF EXISTS portal_forms;
      DROP TABLE IF EXISTS portal_relations;
      DROP TABLE IF EXISTS portal_fields;
      DROP TABLE IF EXISTS portal_modules;
    `);
    db.prepare("DELETE FROM system_settings WHERE setting_key IN ('configuration_version','v2_architecture')").run();
    db.prepare("DELETE FROM menu_settings WHERE href LIKE '/admin%'").run();
    db.prepare("UPDATE audit_logs SET module='Sistem' WHERE module='Admin Paneli'").run();
    db.prepare("UPDATE users SET role='USER'").run();
    const n=new Date().toISOString();
    db.prepare(`INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at) VALUES('portal_version','2.3.0','Portal sürümü',?) ON CONFLICT(setting_key) DO UPDATE SET setting_value='2.3.0',setting_label='Portal sürümü',updated_at=excluded.updated_at`).run(n);
  }catch(e){console.error('REMOVED_MANAGEMENT_CLEANUP_ERROR',e)}
}

export function getThemeSettings(){
  const db=getDatabase(); const rows=db.prepare("SELECT setting_key,setting_value FROM system_settings WHERE setting_key LIKE 'theme_%'").all() as any[];
  return Object.fromEntries(rows.map(r=>[r.setting_key,r.setting_value]));
}

export function getDatabase(){
  if(instance)return instance;
  fs.mkdirSync(getDataDir(),{recursive:true});fs.mkdirSync(getUploadDir(),{recursive:true});fs.mkdirSync(getBackupDir(),{recursive:true});
  const db=new DatabaseSync(path.join(getDataDir(),"portal.db"));
  db.exec("PRAGMA journal_mode=WAL;PRAGMA synchronous=NORMAL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=8000;");
  db.exec(schema);
  installOperationalConflictTriggers(db);
  addColumn(db,"users","role","TEXT NOT NULL DEFAULT 'USER'");
  addColumn(db,"personnel","deleted_at","TEXT");
  addColumn(db,"equipment","imei2","TEXT");
  addColumn(db,"equipment","screen_size","TEXT");
  addColumn(db,"equipment","device_subtype","TEXT");
  try{db.exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_imei2 ON equipment(imei2 COLLATE NOCASE) WHERE imei2 IS NOT NULL AND trim(imei2)<>''")}catch{}
  addColumn(db,"vehicles","fuel_type","TEXT");addColumn(db,"vehicles","transmission","TEXT");addColumn(db,"vehicles","color","TEXT");addColumn(db,"vehicles","engine_number","TEXT");addColumn(db,"vehicles","registration_document_no","TEXT");
  const now=new Date().toISOString();
  const s=db.prepare("INSERT INTO report_catalog(slug,name,report_type,category,description,sort_order,is_active,created_at) VALUES(?,?,?,?,?,?,1,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name,report_type=excluded.report_type,category=excluded.category,description=excluded.description,sort_order=excluded.sort_order,is_active=1");
  db.exec("BEGIN IMMEDIATE");try{for(const r of reports)s.run(...r,now);seedCoreDefaults(db);db.exec("COMMIT")}catch(e){try{db.exec("ROLLBACK")}catch{}throw e}
  cleanupRemovedFeatures(db);
  upgradeV106(db);
  upgradeV107(db);
  upgradeV23(db);
  cleanupRemovedManagementInfrastructure(db);
  upgradeV24(db);
  upgradeV25(db);
  upgradeV26(db);
  upgradeV27(db);
  upgradeV28(db);
  upgradeV281(db);
  upgradeV29(db);
  upgradeV210(db);
  upgradeV211(db);
  upgradeV2112(db);
  upgradeV2113(db);
  upgradeV212(db);
  instance=db;return db;
}
