import type { DatabaseSync } from "node:sqlite";
import { reconcileAllVehicleStatuses } from "./vehicle-state";

function hasColumn(db:DatabaseSync,table:string,column:string){return (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).some(x=>x.name===column)}
function addColumn(db:DatabaseSync,table:string,column:string,sql:string){if(!hasColumn(db,table,column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sql}`)}

/** V2.4 merkezi araç/KM + kiralık araç sözleşme takibi. Additive; mevcut operasyon verileri korunur. */
export function upgradeV24(db:DatabaseSync){
  const now=new Date().toISOString();
  addColumn(db,"vehicle_tire_transactions","performed_by_name","TEXT");
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicle_rental_contracts(
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      fleet_company TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      start_odometer INTEGER NOT NULL CHECK(start_odometer>=0),
      total_km_allowance INTEGER NOT NULL CHECK(total_km_allowance>=0),
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      notes TEXT,
      created_by TEXT REFERENCES users(id),
      closed_by TEXT REFERENCES users(id),
      closed_at TEXT,
      end_odometer INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rental_contract_vehicle ON vehicle_rental_contracts(vehicle_id,start_date DESC,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_rental_contract_due ON vehicle_rental_contracts(status,end_date);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_rental_contract_active_vehicle ON vehicle_rental_contracts(vehicle_id) WHERE status='ACTIVE';

    DROP TRIGGER IF EXISTS rental_contract_validate_insert;
    CREATE TRIGGER rental_contract_validate_insert
    BEFORE INSERT ON vehicle_rental_contracts
    BEGIN
      SELECT CASE WHEN date(NEW.end_date) <= date(NEW.start_date) THEN RAISE(ABORT,'Sözleşme bitiş tarihi başlangıç tarihinden sonra olmalıdır.') END;
      SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM vehicles v WHERE v.id=NEW.vehicle_id AND v.is_active=1 AND v.ownership_type='FLEET') THEN RAISE(ABORT,'Kiralama sözleşmesi yalnızca aktif filo/kiralık araçlar için kullanılabilir.') END;
      SELECT CASE WHEN NEW.start_odometer > COALESCE((SELECT current_odometer FROM vehicles WHERE id=NEW.vehicle_id),0) THEN RAISE(ABORT,'Sözleşme başlangıç KM değeri aracın güncel kilometresinden yüksek olamaz.') END;
    END;

    DROP TRIGGER IF EXISTS rental_contract_validate_dates_update;
    CREATE TRIGGER rental_contract_validate_dates_update
    BEFORE UPDATE OF start_date,end_date ON vehicle_rental_contracts
    BEGIN
      SELECT CASE WHEN date(NEW.end_date) <= date(NEW.start_date) THEN RAISE(ABORT,'Sözleşme bitiş tarihi başlangıç tarihinden sonra olmalıdır.') END;
    END;
  `);
  addColumn(db,"vehicle_rental_contracts","end_odometer","INTEGER");
  // KM yazma işlemi artık ortak servis üzerinden yapılır; eski bağımsız hasar senkron triggerı yalnızca çift kayıt üretmesin diye kaldırılır.
  db.exec("DROP TRIGGER IF EXISTS damage_km_sync;");
  const ssDefault=db.prepare("INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at) VALUES(?,?,?,?) ON CONFLICT(setting_key) DO NOTHING");
  ssDefault.run("rental_contract_due_thresholds","60,30,15,7","Kiralık araç sözleşme bitiş bildirim eşikleri",now);
  ssDefault.run("rental_km_usage_thresholds","80,90,95","Kiralık araç KM kullanım bildirim eşikleri",now);
  db.prepare("INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at) VALUES('portal_version','2.4.0','Portal sürümü',?) ON CONFLICT(setting_key) DO UPDATE SET setting_value='2.4.0',setting_label='Portal sürümü',updated_at=excluded.updated_at").run(now);
  db.prepare("INSERT INTO menu_settings(menu_key,label,href,is_visible,sort_order,is_system,updated_at) VALUES('rental_km','Kiralık Araç KM Takibi','/rental-km',1,45,1,?) ON CONFLICT(menu_key) DO UPDATE SET label=excluded.label,href=excluded.href,is_visible=1,sort_order=excluded.sort_order,is_system=1,updated_at=excluded.updated_at").run(now);
  db.prepare("INSERT INTO report_catalog(slug,name,report_type,category,description,sort_order,is_active,created_at) VALUES('tire-history','Lastik Hareket Geçmişi','Tablo','Araç Raporları','Lastik işlemlerini, kilometreleri ve işlemi fiziksel olarak yapan kişiyi gösterir.',35,1,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name,report_type=excluded.report_type,category=excluded.category,description=excluded.description,sort_order=excluded.sort_order,is_active=1").run(now);
  const wanted:any[]=[
    ["total_vehicles","Toplam Araç",10],["service_vehicles","Servisteki Araçlar",20],["attention","Dikkat Gerektirenler",30],["tasks","Açık Görevler",40],
    ["fleet_vehicles","Filo Araçları",50],["owned_vehicles","Özmal Araçlar",60],["available_vehicles","Boştaki Araçlar",70],["assigned_vehicles","Zimmetli Araçlar",80],["vehicles_in_use","Şu Anda Kullanımda Olan Araçlar",90]
  ];
  db.prepare("UPDATE dashboard_settings SET is_visible=0,updated_at=?").run(now);
  const up=db.prepare("INSERT INTO dashboard_settings(card_key,label,is_visible,sort_order,updated_at) VALUES(?,?,1,?,?) ON CONFLICT(card_key) DO UPDATE SET label=excluded.label,is_visible=1,sort_order=excluded.sort_order,updated_at=excluded.updated_at");
  for(const x of wanted)up.run(...x,now);
  // Eski hasar durumu kalıntılarını ve diğer operasyon statülerini aktif kayıtlardan yeniden hesapla.
  reconcileAllVehicleStatuses(db,null);
}
