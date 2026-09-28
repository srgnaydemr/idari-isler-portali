import type {DatabaseSync} from "node:sqlite";

/** V2.11: Kiralık araç KM tahminleri son 30 günlük merkezi KM geçmişini baz alır. Veri silmez. */
export function upgradeV211(db:DatabaseSync){
  const now=new Date().toISOString();
  db.prepare(`INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at)
    VALUES('rental_usage_window_days','30','Kiralık araç kullanım trendi gün sayısı',?)
    ON CONFLICT(setting_key) DO NOTHING`).run(now);
  db.prepare(`INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at)
    VALUES('portal_version','2.11.0','Portal sürümü',?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value='2.11.0',setting_label='Portal sürümü',updated_at=excluded.updated_at`).run(now);
}
