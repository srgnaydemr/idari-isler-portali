import type {DatabaseSync} from "node:sqlite";

/** V2.7: tekil Kiralık Araç KM Takibinde tek gerçek KM kaynağı vehicles.current_odometer olur. Veri silmez. */
export function upgradeV27(db:DatabaseSync){
  const now=new Date().toISOString();
  const setting=db.prepare("INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at) VALUES(?,?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,setting_label=excluded.setting_label,updated_at=excluded.updated_at");
  setting.run("rental_km_limit_mode","CURRENT_ODOMETER_DIRECT","Kiralık araç KM hesaplama tipi",now);
  setting.run("rental_contract_reference_enabled","0","Tekil sözleşme başlangıç referans KM kullanımı",now);
  setting.run("portal_version","2.7.0","Portal sürümü",now);
  // Eski sütun geriye dönük veritabanı uyumluluğu için fiziksel olarak korunur; aktif hesaplarda kullanılmaz.
  // V2.4'teki başlangıç KM doğrulaması da kaldırılır; tekil sözleşme hesabında bu sütunun artık hiçbir işlevi yoktur.
  db.exec(`
    DROP TRIGGER IF EXISTS rental_contract_validate_insert;
    CREATE TRIGGER rental_contract_validate_insert
    BEFORE INSERT ON vehicle_rental_contracts
    BEGIN
      SELECT CASE WHEN date(NEW.end_date) <= date(NEW.start_date) THEN RAISE(ABORT,'Sözleşme bitiş tarihi başlangıç tarihinden sonra olmalıdır.') END;
      SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM vehicles v WHERE v.id=NEW.vehicle_id AND v.is_active=1 AND v.ownership_type='FLEET') THEN RAISE(ABORT,'Kiralama sözleşmesi yalnızca aktif filo/kiralık araçlar için kullanılabilir.') END;
    END;
  `);
  db.prepare("UPDATE vehicle_rental_contracts SET reference_source='UNUSED_V27',updated_at=? WHERE status='ACTIVE'").run(now);
  db.prepare("UPDATE report_catalog SET name='Kiralık Araç KM ve Havuz Takibi',description='Tekil araçlarda merkezi Güncel KM ve sözleşme KM limiti; ortak havuzlarda ortak KM hakkı üzerinden güncel takip.',is_active=1 WHERE slug='rental-km-tracking'").run();
}
