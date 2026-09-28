import type {DatabaseSync} from "node:sqlite";

/** V2.8: tekil ve havuz KM hesabı aynı merkezi vehicles.current_odometer kaynağına bağlanır. Veri silmez. */
export function upgradeV28(db:DatabaseSync){
  const now=new Date().toISOString();
  const setting=db.prepare("INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at) VALUES(?,?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,setting_label=excluded.setting_label,updated_at=excluded.updated_at");
  setting.run("rental_km_limit_mode","CURRENT_ODOMETER_DIRECT","Kiralık araç KM hesaplama tipi",now);
  setting.run("rental_contract_reference_enabled","0","Tekil sözleşme referans KM kullanımı",now);
  setting.run("rental_pool_reference_enabled","0","KM havuzu referans KM kullanımı",now);
  setting.run("rental_pool_usage_mode","SUM_CURRENT_ODOMETERS","KM havuzu kullanılan KM hesaplama tipi",now);
  setting.run("portal_version","2.8.0","Portal sürümü",now);
  // Eski kolonlar şema uyumluluğu ve geçmiş kayıt bütünlüğü için fiziksel olarak korunur; aktif hesaplarda okunmaz.
  db.prepare("UPDATE vehicle_rental_contracts SET reference_source='UNUSED_V28',updated_at=? WHERE status='ACTIVE'").run(now);
  db.prepare("UPDATE report_catalog SET name='Kiralık Araç KM ve Havuz Takibi',description='Tekil araç ve KM havuzlarında merkezi Araç Güncel KM değerlerinden dinamik hesaplama; haftalık/aylık kullanılabilir KM ve tahmini aşım takibi.',is_active=1 WHERE slug='rental-km-tracking'").run();
}
