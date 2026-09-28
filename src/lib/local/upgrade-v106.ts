import type { DatabaseSync } from "node:sqlite";

/** Additive migration. Business dates remain separate from immutable event timestamps. */
export function upgradeV106(db: DatabaseSync) {
  db.prepare("INSERT INTO menu_settings(menu_key,label,href,is_visible,sort_order,is_system,updated_at) VALUES('vehicle_assignments','Araç Zimmetleri','/arac-zimmetleri',1,25,1,?) ON CONFLICT(menu_key) DO NOTHING").run(new Date().toISOString());
  if (!(db.prepare("PRAGMA table_info(vehicle_damages)").all() as any[]).some(x=>x.name==='odometer')) db.exec("ALTER TABLE vehicle_damages ADD COLUMN odometer INTEGER");
  db.exec(`CREATE TABLE IF NOT EXISTS case_services (
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
    source_type TEXT NOT NULL CHECK(source_type IN ('ACCIDENT','DAMAGE')), source_id TEXT NOT NULL,
    service_name TEXT NOT NULL, entry_at TEXT NOT NULL, entry_km INTEGER NOT NULL CHECK(entry_km>=0), entry_note TEXT,
    exit_at TEXT, exit_km INTEGER CHECK(exit_km>=entry_km), exit_note TEXT,
    created_at TEXT NOT NULL, completed_at TEXT, created_by TEXT REFERENCES users(id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS one_case_service ON case_services(vehicle_id) WHERE exit_at IS NULL;
  CREATE TRIGGER IF NOT EXISTS case_service_keep BEFORE DELETE ON case_services BEGIN SELECT RAISE(ABORT,'Servis geçmişi silinemez.'); END;
  CREATE TRIGGER IF NOT EXISTS case_service_closed BEFORE UPDATE ON case_services WHEN OLD.exit_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'Tamamlanan servis değiştirilemez.'); END;
  CREATE TABLE IF NOT EXISTS vehicle_events (id INTEGER PRIMARY KEY AUTOINCREMENT,vehicle_id TEXT NOT NULL,created_at TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,title TEXT NOT NULL,details TEXT);
  CREATE INDEX IF NOT EXISTS vehicle_events_order ON vehicle_events(vehicle_id,created_at DESC,id DESC);
  CREATE TRIGGER IF NOT EXISTS vehicle_events_keep BEFORE DELETE ON vehicle_events BEGIN SELECT RAISE(ABORT,'Geçmiş silinemez.'); END;
  CREATE TRIGGER IF NOT EXISTS vehicle_events_immutable BEFORE UPDATE ON vehicle_events BEGIN SELECT RAISE(ABORT,'Geçmiş değiştirilemez.'); END;
  CREATE TRIGGER IF NOT EXISTS damage_km_required BEFORE INSERT ON vehicle_damages WHEN NEW.odometer IS NULL OR NEW.odometer<0 OR NEW.odometer != CAST(NEW.odometer AS INTEGER) BEGIN SELECT RAISE(ABORT,'Güncel KM zorunludur.'); END;
  CREATE TRIGGER IF NOT EXISTS damage_km_lower BEFORE INSERT ON vehicle_damages WHEN NEW.odometer < (SELECT current_odometer FROM vehicles WHERE id=NEW.vehicle_id) BEGIN SELECT RAISE(ABORT,'Girilen kilometre aracın mevcut kilometresinden düşük olamaz.'); END;
  CREATE TRIGGER IF NOT EXISTS damage_km_sync AFTER INSERT ON vehicle_damages BEGIN
    INSERT INTO vehicle_odometer_history(id,vehicle_id,previous_odometer,new_odometer,description,recorded_by,recorded_at) SELECT lower(hex(randomblob(16))),NEW.vehicle_id,current_odometer,NEW.odometer,'Bağımsız hasar kaydı',NEW.created_by,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM vehicles WHERE id=NEW.vehicle_id;
    UPDATE vehicles SET current_odometer=NEW.odometer,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.vehicle_id;
  END;`);
  for (const [table,kind] of [["vehicle_accidents","ACCIDENT"],["vehicle_damages","DAMAGE"]]) {
    db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_service_required BEFORE UPDATE OF status ON ${table}
      WHEN NEW.status='IN_SERVICE' AND NOT EXISTS(SELECT 1 FROM case_services WHERE source_type='${kind}' AND source_id=NEW.id AND exit_at IS NULL)
      BEGIN SELECT RAISE(ABORT,'Servis adı, giriş tarihi, saati ve KM ile Servis Süreci bölümünden giriş yapın.'); END;
      CREATE TRIGGER IF NOT EXISTS ${table}_service_exit_required BEFORE UPDATE OF status ON ${table}
      WHEN NEW.status<>'IN_SERVICE' AND EXISTS(SELECT 1 FROM case_services WHERE source_type='${kind}' AND source_id=NEW.id AND exit_at IS NULL)
      BEGIN SELECT RAISE(ABORT,'Önce servis çıkışını tamamlayın.'); END;`);
  }
  const labels: Record<string,string> = {vehicles:'Araç bilgileri',vehicle_assignments:'Araç zimmeti',vehicle_maintenance:'Bakım',vehicle_accidents:'Kaza dosyası',vehicle_damages:'Hasar kaydı',vehicle_tire_transactions:'Lastik işlemi',vehicle_traffic_fines:'Trafik cezası',vehicle_service_records:'Servis / İkame',vehicle_usage_records:'Günlük araç kullanımı',vehicle_replacement_records:'İkame araç',case_services:'Kaza / Hasar servis süreci',vehicle_compliance_documents:'Araç belgesi',vehicle_accident_updates:'Kaza gelişme notu'};
  for(const [table,label] of Object.entries(labels)) {
    const cols=(db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(x=>x.name);
    const vehicle=table==='vehicles'?'NEW.id':table==='vehicle_accident_updates'?'(SELECT vehicle_id FROM vehicle_accidents WHERE id=NEW.accident_id)':'NEW.vehicle_id';
    const json=`json_object(${cols.flatMap(c=>[`'${c}'`,`NEW.${c}`]).join(',')})`;
    for(const op of ['INSERT','UPDATE']) db.exec(`CREATE TRIGGER IF NOT EXISTS event_${table}_${op} AFTER ${op} ON ${table} BEGIN INSERT INTO vehicle_events(vehicle_id,created_at,entity_type,entity_id,title,details) VALUES(${vehicle},strftime('%Y-%m-%dT%H:%M:%fZ','now'),'${table}',NEW.id,'${label} ${op==='INSERT'?'oluşturuldu':'güncellendi'}',${json}); END;`);
  }
  const vehicleForAttachment=`CASE a.entity_type WHEN 'vehicle' THEN a.entity_id WHEN 'accident' THEN (SELECT vehicle_id FROM vehicle_accidents WHERE id=a.entity_id) WHEN 'vehicle_damage' THEN (SELECT vehicle_id FROM vehicle_damages WHERE id=a.entity_id) WHEN 'assignment' THEN (SELECT vehicle_id FROM vehicle_assignments WHERE id=a.entity_id) WHEN 'vehicle_service_record' THEN (SELECT vehicle_id FROM vehicle_service_records WHERE id=a.entity_id) END`;
  db.exec(`CREATE TRIGGER IF NOT EXISTS event_attachment_version AFTER INSERT ON attachment_versions BEGIN INSERT INTO vehicle_events(vehicle_id,created_at,entity_type,entity_id,title,details) SELECT ${vehicleForAttachment},strftime('%Y-%m-%dT%H:%M:%fZ','now'),'attachment_versions',NEW.id,'Araç belgesi yüklendi',json_object('description',NEW.original_filename) FROM attachments a WHERE a.id=NEW.attachment_id AND (${vehicleForAttachment}) IS NOT NULL; END;`);
}
