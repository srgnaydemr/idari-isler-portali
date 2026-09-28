import type {DatabaseSync} from "node:sqlite";

/** V2.9: Araç QR / KM Güncelleme. Mevcut araç ve KM verilerini değiştirmez. */
export function upgradeV29(db:DatabaseSync){
  const now=new Date().toISOString();
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicle_qr_codes(
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL UNIQUE REFERENCES vehicles(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      rotated_at TEXT,
      disabled_at TEXT,
      last_used_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_qr_token ON vehicle_qr_codes(token);
    CREATE INDEX IF NOT EXISTS idx_vehicle_qr_active ON vehicle_qr_codes(is_active,vehicle_id);

    CREATE TABLE IF NOT EXISTS vehicle_qr_km_updates(
      id TEXT PRIMARY KEY,
      qr_id TEXT NOT NULL REFERENCES vehicle_qr_codes(id),
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      previous_odometer INTEGER NOT NULL,
      new_odometer INTEGER NOT NULL,
      difference INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'QR',
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vehicle_qr_updates_vehicle ON vehicle_qr_km_updates(vehicle_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_vehicle_qr_updates_qr ON vehicle_qr_km_updates(qr_id,created_at DESC);
  `);

  const setting=db.prepare("INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at) VALUES(?,?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,setting_label=excluded.setting_label,updated_at=excluded.updated_at");
  setting.run("portal_version","2.9.0","Portal sürümü",now);
  db.prepare("INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at) VALUES('qr_high_km_warning_delta','10000','QR olağandışı KM artışı uyarı eşiği',?) ON CONFLICT(setting_key) DO NOTHING").run(now);
  db.prepare("INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at) VALUES('qr_stale_alert_enabled','0','Uzun süredir KM güncellenmeyen araç uyarısı',?) ON CONFLICT(setting_key) DO NOTHING").run(now);
  db.prepare("INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at) VALUES('qr_stale_days','21','KM güncelliği gecikme günü',?) ON CONFLICT(setting_key) DO NOTHING").run(now);

  db.prepare(`INSERT INTO menu_settings(menu_key,label,href,is_visible,sort_order,is_system,updated_at)
    VALUES('vehicle_qr','Araç QR / KM Güncelleme','/arac-qr-km-guncelleme',1,75,1,?)
    ON CONFLICT(menu_key) DO UPDATE SET label=excluded.label,href=excluded.href,is_visible=1,sort_order=excluded.sort_order,is_system=1,updated_at=excluded.updated_at`).run(now);
}
