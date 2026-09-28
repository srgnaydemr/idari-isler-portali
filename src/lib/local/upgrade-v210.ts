import type {DatabaseSync} from "node:sqlite";

function hasColumn(db:DatabaseSync,table:string,column:string){
  return (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).some((x:any)=>x.name===column);
}

/** V2.10: araç geçmişi, trafik cezası belgeleri/uyarıları, manuel tekil kiralık araç seçimi,
 * QR güncellik filtreleri ve yıllık maliyet raporu geliştirmeleri. Veri silmez. */
export function upgradeV210(db:DatabaseSync){
  const now=new Date().toISOString();
  if(!hasColumn(db,"vehicles","rental_tracking_enabled")){
    db.exec("ALTER TABLE vehicles ADD COLUMN rental_tracking_enabled INTEGER NOT NULL DEFAULT 0");
    // V2.9'da tekil listede görünen mevcut filo araçlarını koru. Yeni araçlar kullanıcı tarafından eklenir.
    db.exec(`UPDATE vehicles SET rental_tracking_enabled=1
      WHERE is_active=1 AND ownership_type='FLEET'
      AND NOT EXISTS(
        SELECT 1 FROM rental_km_pool_members m JOIN rental_km_pools p ON p.id=m.pool_id
        WHERE m.vehicle_id=vehicles.id AND m.left_at IS NULL AND p.status='ACTIVE'
      )`);
  }
  if(!hasColumn(db,"vehicle_tire_transactions","cost")){
    db.exec("ALTER TABLE vehicle_tire_transactions ADD COLUMN cost REAL NOT NULL DEFAULT 0");
  }
  // Trafik cezası belgeleri de araç zaman çizelgesine bağlansın.
  db.exec(`DROP TRIGGER IF EXISTS event_attachment_version;
    CREATE TRIGGER event_attachment_version AFTER INSERT ON attachment_versions BEGIN
      INSERT INTO vehicle_events(vehicle_id,created_at,entity_type,entity_id,title,details)
      SELECT CASE a.entity_type
        WHEN 'vehicle' THEN a.entity_id
        WHEN 'accident' THEN (SELECT vehicle_id FROM vehicle_accidents WHERE id=a.entity_id)
        WHEN 'vehicle_damage' THEN (SELECT vehicle_id FROM vehicle_damages WHERE id=a.entity_id)
        WHEN 'assignment' THEN (SELECT vehicle_id FROM vehicle_assignments WHERE id=a.entity_id)
        WHEN 'vehicle_service_record' THEN (SELECT vehicle_id FROM vehicle_service_records WHERE id=a.entity_id)
        WHEN 'traffic_fine' THEN (SELECT vehicle_id FROM vehicle_traffic_fines WHERE id=a.entity_id)
      END,
      strftime('%Y-%m-%dT%H:%M:%fZ','now'),'attachment_versions',NEW.id,
      CASE WHEN a.entity_type='traffic_fine' THEN 'Trafik cezası belgesi yüklendi' ELSE 'Araç belgesi yüklendi' END,
      json_object('description',NEW.original_filename)
      FROM attachments a WHERE a.id=NEW.attachment_id AND (CASE a.entity_type
        WHEN 'vehicle' THEN a.entity_id
        WHEN 'accident' THEN (SELECT vehicle_id FROM vehicle_accidents WHERE id=a.entity_id)
        WHEN 'vehicle_damage' THEN (SELECT vehicle_id FROM vehicle_damages WHERE id=a.entity_id)
        WHEN 'assignment' THEN (SELECT vehicle_id FROM vehicle_assignments WHERE id=a.entity_id)
        WHEN 'vehicle_service_record' THEN (SELECT vehicle_id FROM vehicle_service_records WHERE id=a.entity_id)
        WHEN 'traffic_fine' THEN (SELECT vehicle_id FROM vehicle_traffic_fines WHERE id=a.entity_id)
      END) IS NOT NULL;
    END;`);
  db.prepare(`INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at)
    VALUES('portal_version','2.10.0','Portal sürümü',?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value='2.10.0',setting_label='Portal sürümü',updated_at=excluded.updated_at`).run(now);
  db.prepare(`INSERT INTO alert_settings(setting_key,label,days_before,is_active,updated_at)
    VALUES('traffic_fine','Ödenmemiş trafik cezası',0,1,?)
    ON CONFLICT(setting_key) DO NOTHING`).run(now);
}
