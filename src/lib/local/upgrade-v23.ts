import type { DatabaseSync } from "node:sqlite";

/** V2.3 canlı kullanım veri tutarlılığı ve menü geçişi. */
export function upgradeV23(db: DatabaseSync) {
  const now = new Date().toISOString();

  db.prepare("INSERT INTO menu_settings(menu_key,label,href,is_visible,sort_order,is_system,updated_at) VALUES('users','Kullanıcılar','/kullanicilar',1,85,1,?) ON CONFLICT(menu_key) DO UPDATE SET label='Kullanıcılar',href='/kullanicilar',is_visible=1,sort_order=85,is_system=1,updated_at=excluded.updated_at").run(now);

  // Eski kayıtlarda iade tarihi bulunmasına rağmen ACTIVE kalmış zimmetleri düzelt.
  db.prepare("UPDATE personnel_assignments SET status='RETURNED',updated_at=? WHERE return_date IS NOT NULL AND status='ACTIVE'").run(now);

  // Aktif zimmet bulunan ekipman kesinlikle Zimmetli görünmelidir.
  db.prepare("UPDATE equipment SET status='ASSIGNED',updated_at=? WHERE EXISTS(SELECT 1 FROM personnel_assignments pa WHERE pa.equipment_id=equipment.id AND pa.return_date IS NULL AND pa.status='ACTIVE') AND status<>'ASSIGNED'").run(now);

  // Zimmeti kalmamış ancak eski veride Zimmetli görünen ekipmanı havuza geri al.
  db.prepare("UPDATE equipment SET status='AVAILABLE',updated_at=? WHERE status='ASSIGNED' AND NOT EXISTS(SELECT 1 FROM personnel_assignments pa WHERE pa.equipment_id=equipment.id AND pa.return_date IS NULL AND pa.status='ACTIVE')").run(now);

  db.prepare("INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at) VALUES('portal_version','2.3.0','Portal sürümü',?) ON CONFLICT(setting_key) DO UPDATE SET setting_value='2.3.0',setting_label='Portal sürümü',updated_at=excluded.updated_at").run(now);
}
