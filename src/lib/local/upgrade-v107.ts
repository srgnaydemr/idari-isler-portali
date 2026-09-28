import type { DatabaseSync } from "node:sqlite";

function hasColumn(db: DatabaseSync, table: string, column: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).some((x) => x.name === column);
}
function addColumn(db: DatabaseSync, table: string, column: string, sql: string) {
  if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sql}`);
}

/** v1.0.7 additive migration. Existing records are preserved. */
export function upgradeV107(db: DatabaseSync) {
  const now = new Date().toISOString();

  addColumn(db, "personnel", "phone", "TEXT");
  addColumn(db, "vehicle_service_records", "service_out_odometer", "INTEGER");
  addColumn(db, "vehicle_tire_transactions", "transaction_time", "TEXT");
  addColumn(db, "notifications", "due_date", "TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS equipment_asset_sequences (
      equipment_code TEXT PRIMARY KEY,
      prefix TEXT NOT NULL UNIQUE,
      last_number INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TRIGGER IF NOT EXISTS replacement_history_keep
    BEFORE DELETE ON vehicle_replacement_records
    BEGIN
      SELECT RAISE(ABORT,'İkame araç geçmişi silinemez.');
    END;

    DROP TRIGGER IF EXISTS tire_km_required_insert;
    DROP TRIGGER IF EXISTS tire_km_lower_insert;
    DROP TRIGGER IF EXISTS tire_km_sync_insert;
    DROP TRIGGER IF EXISTS tire_km_required_update;
    DROP TRIGGER IF EXISTS tire_km_lower_update;
    DROP TRIGGER IF EXISTS tire_km_sync_update;

    CREATE TRIGGER tire_km_required_insert
    BEFORE INSERT ON vehicle_tire_transactions
    WHEN NEW.odometer IS NULL OR NEW.odometer < 0 OR NEW.odometer != CAST(NEW.odometer AS INTEGER)
    BEGIN SELECT RAISE(ABORT,'İşlem KM zorunludur.'); END;

    CREATE TRIGGER tire_km_lower_insert
    BEFORE INSERT ON vehicle_tire_transactions
    WHEN NEW.odometer < (SELECT current_odometer FROM vehicles WHERE id=NEW.vehicle_id)
    BEGIN SELECT RAISE(ABORT,'Girilen kilometre aracın mevcut güncel kilometresinden düşük olamaz.'); END;

    CREATE TRIGGER tire_km_sync_insert
    AFTER INSERT ON vehicle_tire_transactions
    WHEN NEW.odometer > (SELECT current_odometer FROM vehicles WHERE id=NEW.vehicle_id)
    BEGIN
      INSERT INTO vehicle_odometer_history(id,vehicle_id,previous_odometer,new_odometer,description,recorded_by,recorded_at)
      SELECT lower(hex(randomblob(16))),NEW.vehicle_id,current_odometer,NEW.odometer,'Lastik işlemi',NEW.created_by,strftime('%Y-%m-%dT%H:%M:%fZ','now')
      FROM vehicles WHERE id=NEW.vehicle_id;
      UPDATE vehicles SET current_odometer=NEW.odometer,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.vehicle_id;
    END;

    CREATE TRIGGER tire_km_required_update
    BEFORE UPDATE OF vehicle_id,odometer ON vehicle_tire_transactions
    WHEN NEW.odometer IS NULL OR NEW.odometer < 0 OR NEW.odometer != CAST(NEW.odometer AS INTEGER)
    BEGIN SELECT RAISE(ABORT,'İşlem KM zorunludur.'); END;

    CREATE TRIGGER tire_km_lower_update
    BEFORE UPDATE OF vehicle_id,odometer ON vehicle_tire_transactions
    WHEN NEW.odometer < (SELECT current_odometer FROM vehicles WHERE id=NEW.vehicle_id)
         AND NEW.odometer <> OLD.odometer
    BEGIN SELECT RAISE(ABORT,'Girilen kilometre aracın mevcut güncel kilometresinden düşük olamaz.'); END;

    CREATE TRIGGER tire_km_sync_update
    AFTER UPDATE OF vehicle_id,odometer ON vehicle_tire_transactions
    WHEN NEW.odometer > (SELECT current_odometer FROM vehicles WHERE id=NEW.vehicle_id)
    BEGIN
      INSERT INTO vehicle_odometer_history(id,vehicle_id,previous_odometer,new_odometer,description,recorded_by,recorded_at)
      SELECT lower(hex(randomblob(16))),NEW.vehicle_id,current_odometer,NEW.odometer,'Lastik işlemi güncellendi',NEW.created_by,strftime('%Y-%m-%dT%H:%M:%fZ','now')
      FROM vehicles WHERE id=NEW.vehicle_id;
      UPDATE vehicles SET current_odometer=NEW.odometer,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.vehicle_id;
    END;
  `);

  const insertDef = db.prepare(`INSERT INTO system_definitions
    (id,category,code,name,is_active,sort_order,is_system,created_at,updated_at)
    VALUES(lower(hex(randomblob(16))),?,?,?,?,?,?,?,?)
    ON CONFLICT(category,name) DO UPDATE SET code=excluded.code,is_active=1,sort_order=excluded.sort_order,updated_at=excluded.updated_at`);
  insertDef.run("document_type", "PARKING", "Otopark", 1, 40, 1, now, now);
  insertDef.run("vehicle_status", "TEMP_IN_USE", "Geçici Kullanımda", 1, 25, 1, now, now);
  insertDef.run("equipment_status", "AVAILABLE", "Havuzda", 1, 10, 1, now, now);
  insertDef.run("equipment_status", "ASSIGNED", "Zimmetli", 1, 20, 1, now, now);
  insertDef.run("equipment_status", "DAMAGED", "Hasarlı", 1, 30, 1, now, now);
  insertDef.run("equipment_status", "SERVICE", "Serviste", 1, 40, 1, now, now);
  insertDef.run("equipment_status", "INACTIVE", "Kullanım Dışı", 1, 50, 1, now, now);

  db.prepare(`INSERT INTO alert_settings(setting_key,label,days_before,is_active,updated_at)
    VALUES('parking','Otopark süresi uyarısı',30,1,?)
    ON CONFLICT(setting_key) DO UPDATE SET label=excluded.label,is_active=1,updated_at=excluded.updated_at`).run(now);

  // Eski açık geçici kullanım kayıtlarını yeni operasyon durumuyla uyumlu hale getir.
  db.prepare(`UPDATE vehicles SET status='TEMP_IN_USE',updated_at=?
    WHERE id IN (SELECT vehicle_id FROM vehicle_usage_records WHERE status='IN_USE' AND return_at IS NULL)
      AND status NOT IN ('SERVICE','DAMAGED','MAINTENANCE','INACTIVE')`).run(now);

  // Sık kullanılan geçmiş aramalarını production ortamında hızlandır.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_replacement_plate_history ON vehicle_replacement_records(replacement_plate, replacement_received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_compliance_due_tracking ON vehicle_compliance_documents(document_type,end_date,vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_tire_vehicle_history ON vehicle_tire_transactions(vehicle_id,transaction_date DESC,transaction_time DESC);
  `);

  // Eski genel COMPLIANCE bildirimlerini silme; geçmiş olarak koru ve yeni tür bazlı bildirimlerle okunmamış sayısını şişirmesin.
  db.prepare("UPDATE notifications SET is_read=1,read_at=COALESCE(read_at,?) WHERE notification_type='COMPLIANCE' AND is_read=0").run(now);
}
