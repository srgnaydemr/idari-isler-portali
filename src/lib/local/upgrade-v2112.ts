import type {DatabaseSync} from "node:sqlite";

/** V2.11.2: KM trend normalizasyonu + sade Kiralık Araç KM detay ekranı. Veri silmez. */
export function upgradeV2112(db:DatabaseSync){
  const now=new Date().toISOString();
  db.prepare(`INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at)
    VALUES('portal_version','2.11.2','Portal sürümü',?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value='2.11.2',setting_label='Portal sürümü',updated_at=excluded.updated_at`).run(now);
}
