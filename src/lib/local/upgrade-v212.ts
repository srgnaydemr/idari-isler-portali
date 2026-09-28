import type {DatabaseSync} from 'node:sqlite';

export function upgradeV212(db:DatabaseSync){
 const add=(table:string,name:string,type='TEXT')=>{if(!(db.prepare(`PRAGMA table_info(${table})`).all() as any[]).some(x=>x.name===name))db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`)};
 db.exec('BEGIN IMMEDIATE');
 try{
 for(const name of ['company','branch','requested_documents'])add('personnel',name);
 add('vehicle_assignments','personnel_id');
 for(const table of ['personnel_assignments','vehicle_usage_records','vehicle_assignments']){
  add(table,'personnel_snapshot');
  // Existing snapshots remain untouched. Unknown historical information is not invented.
  db.exec(`CREATE TRIGGER IF NOT EXISTS snapshot_${table} AFTER INSERT ON ${table} BEGIN
   UPDATE ${table} SET personnel_snapshot=(SELECT json_object('first_name',first_name,'last_name',last_name,'company',company,'branch',branch,'department',department) FROM personnel WHERE id=NEW.personnel_id) WHERE id=NEW.id;
  END;`);
 }
 add('vehicles','is_replacement','INTEGER NOT NULL DEFAULT 0');
 add('vehicle_replacement_records','replacement_vehicle_id');
 add('vehicle_replacement_records','replacement_odometer','INTEGER');
 add('vehicle_usage_records','replacement_record_id');
 add('vehicle_usage_records','main_plate_snapshot');
 add('vehicle_usage_records','checkout_km_known','INTEGER NOT NULL DEFAULT 1');
 db.exec(`CREATE TABLE IF NOT EXISTS compliance_current(vehicle_id TEXT NOT NULL,document_type TEXT NOT NULL,document_id TEXT NOT NULL,PRIMARY KEY(vehicle_id,document_type));
 INSERT OR IGNORE INTO compliance_current SELECT d.vehicle_id,d.document_type,d.id FROM vehicle_compliance_documents d WHERE d.id=(SELECT x.id FROM vehicle_compliance_documents x WHERE x.vehicle_id=d.vehicle_id AND x.document_type=d.document_type ORDER BY x.end_date DESC,x.created_at DESC,x.id DESC LIMIT 1);
 CREATE TRIGGER IF NOT EXISTS compliance_current_insert AFTER INSERT ON vehicle_compliance_documents BEGIN
 INSERT INTO compliance_current VALUES(NEW.vehicle_id,NEW.document_type,NEW.id) ON CONFLICT(vehicle_id,document_type) DO UPDATE SET document_id=excluded.document_id; END;
 CREATE TRIGGER IF NOT EXISTS compliance_current_update AFTER UPDATE OF end_date ON vehicle_compliance_documents BEGIN
 INSERT INTO compliance_current VALUES(NEW.vehicle_id,NEW.document_type,NEW.id) ON CONFLICT(vehicle_id,document_type) DO UPDATE SET document_id=excluded.document_id; END;
 CREATE TABLE IF NOT EXISTS import_previews(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,applied_at TEXT,result TEXT);
 CREATE TABLE IF NOT EXISTS compliance_change_history(id TEXT PRIMARY KEY,vehicle_id TEXT NOT NULL,document_type TEXT NOT NULL,old_date TEXT,new_date TEXT NOT NULL,changed_by TEXT,changed_at TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS freeze_personnel_before_update BEFORE UPDATE OF first_name,last_name,company,branch,department ON personnel BEGIN
  UPDATE personnel_assignments SET personnel_snapshot=json_object('first_name',OLD.first_name,'last_name',OLD.last_name,'company',OLD.company,'branch',OLD.branch,'department',OLD.department,'legacy_snapshot',1) WHERE personnel_id=OLD.id AND personnel_snapshot IS NULL;
  UPDATE vehicle_usage_records SET personnel_snapshot=json_object('first_name',OLD.first_name,'last_name',OLD.last_name,'company',OLD.company,'branch',OLD.branch,'department',department_snapshot,'legacy_snapshot',1) WHERE personnel_id=OLD.id AND personnel_snapshot IS NULL;
  UPDATE vehicle_assignments SET personnel_snapshot=json_object('first_name',OLD.first_name,'last_name',OLD.last_name,'company',OLD.company,'branch',OLD.branch,'department',OLD.department,'legacy_snapshot',1) WHERE personnel_id=OLD.id AND personnel_snapshot IS NULL;
 END;
 CREATE TRIGGER IF NOT EXISTS usage_replacement_snapshot AFTER INSERT ON vehicle_usage_records BEGIN
  UPDATE vehicle_usage_records SET replacement_record_id=(SELECT id FROM vehicle_replacement_records WHERE replacement_vehicle_id=NEW.vehicle_id AND status='ACTIVE' LIMIT 1),main_plate_snapshot=(SELECT v.plate FROM vehicle_replacement_records r JOIN vehicles v ON v.id=r.vehicle_id WHERE r.replacement_vehicle_id=NEW.vehicle_id AND r.status='ACTIVE' LIMIT 1) WHERE id=NEW.id;
 END;`);
 const sync=`
  SELECT CASE WHEN EXISTS(SELECT 1 FROM vehicles WHERE replace(upper(plate),' ','')=replace(upper(NEW.replacement_plate),' ','') AND is_replacement=0) THEN RAISE(ABORT,'İkame plakası mevcut ana araçla çakışıyor.') END;
  SELECT CASE WHEN NEW.status='ACTIVE' AND EXISTS(SELECT 1 FROM vehicle_replacement_records WHERE id<>NEW.id AND status='ACTIVE' AND replace(upper(replacement_plate),' ','')=replace(upper(NEW.replacement_plate),' ','')) THEN RAISE(ABORT,'Bu ikame plaka başka bir aktif süreçte kullanılıyor.') END;
  INSERT INTO vehicles(id,plate,ownership_type,brand,model,model_year,vehicle_type,tire_storage_dealer,status,is_active,is_replacement,created_at,updated_at)
   SELECT 'replacement:'||NEW.id,upper(trim(NEW.replacement_plate)),'FLEET','İkame','Araç',CAST(strftime('%Y','now') AS INTEGER),'İkame Araç','—',CASE WHEN NEW.status='ACTIVE' THEN 'REPLACEMENT' ELSE 'INACTIVE' END,CASE WHEN NEW.status='ACTIVE' THEN 1 ELSE 0 END,1,NEW.created_at,NEW.updated_at
   WHERE NOT EXISTS(SELECT 1 FROM vehicles WHERE replace(upper(plate),' ','')=replace(upper(NEW.replacement_plate),' ',''));
  UPDATE vehicle_replacement_records SET replacement_vehicle_id=(SELECT id FROM vehicles WHERE replace(upper(plate),' ','')=replace(upper(NEW.replacement_plate),' ','')) WHERE id=NEW.id;
  UPDATE vehicles SET is_active=CASE WHEN EXISTS(SELECT 1 FROM vehicle_replacement_records WHERE replacement_vehicle_id=vehicles.id AND status='ACTIVE') THEN 1 ELSE 0 END,status=CASE WHEN NEW.status='ACTIVE' AND status='INACTIVE' THEN 'REPLACEMENT' WHEN NEW.status<>'ACTIVE' THEN 'INACTIVE' ELSE status END WHERE id=(SELECT replacement_vehicle_id FROM vehicle_replacement_records WHERE id=NEW.id);
 `;
 db.exec(`CREATE TRIGGER IF NOT EXISTS replacement_vehicle_insert AFTER INSERT ON vehicle_replacement_records BEGIN ${sync} END;
 CREATE TRIGGER IF NOT EXISTS replacement_vehicle_update AFTER UPDATE OF replacement_plate,status ON vehicle_replacement_records BEGIN ${sync} END;
 CREATE TRIGGER IF NOT EXISTS replacement_return_guard BEFORE UPDATE OF status ON vehicle_replacement_records WHEN NEW.status<>'ACTIVE' AND OLD.status='ACTIVE' BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM vehicle_usage_records WHERE vehicle_id=OLD.replacement_vehicle_id AND status='IN_USE' AND return_at IS NULL) THEN RAISE(ABORT,'İkame araç personelde kullanımda. Önce Araç Kullanım / Teslim bölümünden iade alın.') END; END;`);
 // Only unlinked records are migrated, once; collisions remain visible for manual resolution.
 const legacy=db.prepare('SELECT id FROM vehicle_replacement_records WHERE replacement_vehicle_id IS NULL').all() as any[];
 for(const r of legacy){try{db.prepare('UPDATE vehicle_replacement_records SET replacement_plate=replacement_plate WHERE id=?').run(r.id)}catch(e){console.error('İkame eşleştirme gerekli',r.id,String(e))}}
 db.prepare("UPDATE system_settings SET setting_value='2.12.0' WHERE setting_key='portal_version'").run();
 db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}
}
