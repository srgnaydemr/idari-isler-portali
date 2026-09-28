import type {DatabaseSync} from "node:sqlite";

/** V2.11.3: Kiralık Araç KM Takibi geçici olarak uygulamadan tamamen kaldırıldı.
 * Araç, sözleşme ve merkezi KM geçmişi verileri silinmez. */
export function upgradeV2113(db:DatabaseSync){
  const now=new Date().toISOString();
  db.prepare(`INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at)
    VALUES('portal_version','2.11.3','Portal sürümü',?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value='2.11.3',setting_label='Portal sürümü',updated_at=excluded.updated_at`).run(now);

  // Eski migrationlar her açılışta menü/rapor kaydını oluşturabildiği için son adımda fiziksel olarak kaldır.
  db.prepare("DELETE FROM menu_settings WHERE menu_key='rental_km'").run();
  db.prepare("DELETE FROM report_catalog WHERE slug='rental-km-tracking'").run();
  // Preserve stored rental tracking preferences when upgrading.
  db.prepare("DELETE FROM system_settings WHERE setting_key IN ('rental_contract_reference_enabled','rental_km_limit_mode','rental_km_usage_thresholds','rental_pool_reference_enabled','rental_pool_usage_mode')").run();

  // Artık bulunmayan KM takip/havuz ekranlarına ait bildirimleri temizle.
  db.prepare("DELETE FROM notifications WHERE notification_type IN ('RENTAL_RISK','RENTAL_POOL_CONTRACT','RENTAL_POOL_RISK')").run();
}
