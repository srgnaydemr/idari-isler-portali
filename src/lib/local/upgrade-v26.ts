import type {DatabaseSync} from "node:sqlite";

/** V2.6 geçiş işaretleri. V2.7 tekil KM hesabı bu sürümdeki eski referans mantığını artık kullanmaz. */
export function upgradeV26(db:DatabaseSync){
  const now=new Date().toISOString();
  const setting=db.prepare("INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at) VALUES(?,?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,setting_label=excluded.setting_label,updated_at=excluded.updated_at");
  setting.run("rental_km_limit_mode","MAX_DELIVERY_ODOMETER","Kiralık araç sözleşme KM hesaplama tipi",now);
  setting.run("portal_version","2.6.0","Portal sürümü",now);
  db.prepare("UPDATE report_catalog SET name='Kiralık Araç KM ve Havuz Takibi',description='Tekil kiralık araçlarda sözleşme KM limiti; ortak havuzlarda ortak KM hakkı üzerinden takip.',is_active=1 WHERE slug='rental-km-tracking'").run();
}
