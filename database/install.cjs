const {statements,quote}=require('./mysql-schema.cjs');
const seeds=require('./default-seeds.json');
async function session(c){await c.query("SET SESSION sql_mode='STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,PIPES_AS_CONCAT,IGNORE_SPACE', time_zone='+00:00'")}
async function hasColumn(c,table,column){const [[r]]=await c.query('SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',[table,column]);return Number(r.n)>0}
async function dropLegacySourceUnique(c){
 const [indexes]=await c.query("SELECT INDEX_NAME,NON_UNIQUE,GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) cols FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vehicle_replacement_records' GROUP BY INDEX_NAME,NON_UNIQUE");
 for(const idx of indexes){if(!Number(idx.NON_UNIQUE)&&idx.INDEX_NAME!=='PRIMARY'&&String(idx.cols)==='source_type,source_id')await c.query(`DROP INDEX ${quote(idx.INDEX_NAME)} ON vehicle_replacement_records`)}
 const [[sourceIndex]]=await c.query("SELECT COUNT(*) n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vehicle_replacement_records' AND INDEX_NAME='idx_replacement_source'");
 if(!Number(sourceIndex.n))await c.query('CREATE INDEX idx_replacement_source ON vehicle_replacement_records(source_type,source_id,status,created_at)');
}
async function apply214(c){
 const [[done]]=await c.query("SELECT * FROM portal_schema_migrations WHERE version='2.14.0'");if(done?.ready)return;
 for(const [name,type] of [['replacement_brand_model','VARCHAR(255) NULL'],['replacement_return_odometer','BIGINT NULL'],['return_reason','LONGTEXT NULL'],['return_notes','LONGTEXT NULL']])if(!(await hasColumn(c,'vehicle_replacement_records',name)))await c.query(`ALTER TABLE vehicle_replacement_records ADD COLUMN ${quote(name)} ${type}`);
 await dropLegacySourceUnique(c);
 await c.query('DROP TRIGGER IF EXISTS replacement_plate_history_guard');
 await c.query("INSERT INTO portal_schema_migrations(version,ready,applied_at) VALUES('2.14.0',1,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE ready=1,applied_at=VALUES(applied_at)");
}
async function apply2141(c){
 const [[done]]=await c.query("SELECT * FROM portal_schema_migrations WHERE version='2.14.1'");if(done?.ready)return;
 for(const [name,type] of [['replacement_brand_model','VARCHAR(255) NULL'],['replacement_return_odometer','BIGINT NULL'],['return_reason','LONGTEXT NULL'],['return_notes','LONGTEXT NULL']])if(!(await hasColumn(c,'vehicle_replacement_records',name)))await c.query(`ALTER TABLE vehicle_replacement_records ADD COLUMN ${quote(name)} ${type}`);
 await dropLegacySourceUnique(c);
 for(const name of ['replacement_plate_history_guard','trg_one_active_replacement_insert','trg_one_active_replacement_update'])await c.query('DROP TRIGGER IF EXISTS '+quote(name));
 await c.query(`CREATE TRIGGER trg_one_active_replacement_insert BEFORE INSERT ON vehicle_replacement_records FOR EACH ROW BEGIN IF COALESCE(@portal_import,0)=0 AND NEW.status='ACTIVE' AND EXISTS(SELECT 1 FROM vehicle_replacement_records WHERE vehicle_id=NEW.vehicle_id AND status='ACTIVE') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ACTIVE_REPLACEMENT_EXISTS'; END IF; END`);
 await c.query(`CREATE TRIGGER trg_one_active_replacement_update BEFORE UPDATE ON vehicle_replacement_records FOR EACH ROW BEGIN IF COALESCE(@portal_import,0)=0 AND NEW.status='ACTIVE' AND EXISTS(SELECT 1 FROM vehicle_replacement_records WHERE vehicle_id=NEW.vehicle_id AND status='ACTIVE' AND id<>NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ACTIVE_REPLACEMENT_EXISTS'; END IF; END`);
 const menu={dashboard:'/ana-panel',vehicles:'/araclar',maintenance:'/servis-ikame',accidents:'/kaza-hasar',tires:'/lastik-yonetimi',personnel:'/personel-yonetimi',personnel_assets:'/personel-zimmetleri',vehicle_usage:'/arac-kullanim-teslim',tasks:'/gorevler',calendar:'/takvim',reports:'/raporlar',users:'/kullanicilar',audit:'/islem-gecmisi',vehicle_assignments:'/arac-zimmetleri',vehicle_qr:'/arac-qr-km-guncelleme'};
 for(const [key,href] of Object.entries(menu))await c.query('UPDATE menu_settings SET href=?,updated_at=UTC_TIMESTAMP(3) WHERE menu_key=?',[href,key]);
 await c.query("INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at) VALUES('portal_version','2.14.1','Portal sürümü',UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_at=VALUES(updated_at)");
 await c.query("INSERT INTO portal_schema_migrations(version,ready,applied_at) VALUES('2.14.1',1,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE ready=1,applied_at=VALUES(applied_at)");
}

async function enforceQrEligibility(c){
 await c.query(`UPDATE vehicle_qr_codes q JOIN vehicles v ON v.id=q.vehicle_id
   SET q.is_active=0,q.disabled_at=COALESCE(q.disabled_at,UTC_TIMESTAMP(3)),q.updated_at=UTC_TIMESTAMP(3)
   WHERE v.is_replacement=1 AND q.is_active<>0`);
}
async function normalizeReplacementVehicleStates(c){
 await c.query(`UPDATE vehicles v SET v.status=CASE
   WHEN v.is_active=0 THEN 'INACTIVE'
   WHEN EXISTS(SELECT 1 FROM vehicle_usage_records vu WHERE vu.vehicle_id=v.id AND vu.status='IN_USE' AND vu.return_at IS NULL) THEN 'TEMP_IN_USE'
   WHEN EXISTS(SELECT 1 FROM vehicle_assignments va WHERE va.vehicle_id=v.id AND va.return_date IS NULL) THEN 'ASSIGNED'
   ELSE 'REPLACEMENT' END
   WHERE v.is_replacement=1`);
}
async function apply215(c){
 const [[done]]=await c.query("SELECT * FROM portal_schema_migrations WHERE version='2.15.0'");
 // Veri politikası her init sırasında tekrar uygulanır; restore/import sonrası eski ikame QR'ları da pasif kalır.
 await enforceQrEligibility(c);
 await normalizeReplacementVehicleStates(c);
 if(done?.ready)return;
 for(const name of ['trg_qr_no_replacement_insert','trg_qr_no_replacement_update'])await c.query('DROP TRIGGER IF EXISTS '+quote(name));
 await c.query(`CREATE TRIGGER trg_qr_no_replacement_insert BEFORE INSERT ON vehicle_qr_codes FOR EACH ROW BEGIN IF COALESCE(@portal_import,0)=0 AND EXISTS(SELECT 1 FROM vehicles WHERE id=NEW.vehicle_id AND is_replacement=1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REPLACEMENT_QR_NOT_ALLOWED'; END IF; END`);
 await c.query(`CREATE TRIGGER trg_qr_no_replacement_update BEFORE UPDATE ON vehicle_qr_codes FOR EACH ROW BEGIN IF COALESCE(@portal_import,0)=0 AND (NOT (NEW.vehicle_id <=> OLD.vehicle_id) OR NEW.is_active=1) AND EXISTS(SELECT 1 FROM vehicles WHERE id=NEW.vehicle_id AND is_replacement=1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REPLACEMENT_QR_NOT_ALLOWED'; END IF; END`);
 await c.query("INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at) VALUES('portal_version','2.15.0','Portal sürümü',UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_at=VALUES(updated_at)");
 await c.query("INSERT INTO portal_schema_migrations(version,ready,applied_at) VALUES('2.15.0',1,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE ready=1,applied_at=VALUES(applied_at)");
}
async function install(c,{seed=false}={}){
 await session(c);
 const [[lock]]=await c.query("SELECT GET_LOCK(CONCAT(DATABASE(),':portal-schema'),30) acquired");if(!lock.acquired)throw Error('Şema kilidi alınamadı.');
 try{
  await c.query('CREATE TABLE IF NOT EXISTS portal_schema_migrations(version VARCHAR(40) PRIMARY KEY, ready TINYINT NOT NULL DEFAULT 0, applied_at DATETIME(3) NOT NULL) ENGINE=InnoDB');
  const [[baseDone]]=await c.query("SELECT * FROM portal_schema_migrations WHERE version='2.13.0'");
  if(!baseDone?.ready){
   const sql=statements();
   for(const q of sql.ddl)await c.query(q);
   for(const q of sql.indexes){const name=q.match(/INDEX `([^`]+)`/)[1],table=q.match(/ ON `([^`]+)`/)[1];const [[r]]=await c.query('SELECT count(*) n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?',[table,name]);if(!r.n)await c.query(q)}
   for(const q of [...sql.checks,...sql.foreign]){const name=q.match(/CONSTRAINT `([^`]+)`/)[1];const [[r]]=await c.query('SELECT count(*) n FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME=?',[name]);if(!r.n)await c.query(q)}
   await c.query('DROP FUNCTION IF EXISTS portal_search');await c.query(sql.searchFunction);
   for(const q of sql.triggers){const name=q.match(/CREATE TRIGGER\s+(\w+)/i)[1];await c.query('DROP TRIGGER IF EXISTS '+quote(name));try{await c.query(q)}catch(e){throw Error(name+': '+e.message+'\n'+q)}}
   if(seed){await c.beginTransaction();try{await c.query('SET @portal_import=1');for(const [table,rows] of Object.entries(seeds))for(const row of rows){const keys=Object.keys(row);await c.query(`INSERT IGNORE INTO ${quote(table)}(${keys.map(quote)}) VALUES(${keys.map(()=>'?')})`,keys.map(k=>row[k]))}await c.commit()}catch(e){await c.rollback();throw e}finally{await c.query('SET @portal_import=0')}}
   await c.query("INSERT INTO portal_schema_migrations VALUES('2.13.0',1,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE ready=1,applied_at=VALUES(applied_at)");
  }
  await apply214(c);await apply2141(c);await apply215(c);
 }finally{await c.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(),':portal-schema'))")}
}
async function verifyForeignKeys(c){const [keys]=await c.query('SELECT TABLE_NAME child_table,COLUMN_NAME child_column,REFERENCED_TABLE_NAME parent_table,REFERENCED_COLUMN_NAME parent_column FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL');for(const f of keys){const [[r]]=await c.query(`SELECT count(*) n FROM ${quote(f.child_table)} child LEFT JOIN ${quote(f.parent_table)} parent ON parent.${quote(f.parent_column)}=child.${quote(f.child_column)} WHERE child.${quote(f.child_column)} IS NOT NULL AND parent.${quote(f.parent_column)} IS NULL`);if(Number(r.n))throw Error(`${f.child_table}.${f.child_column}: ${r.n} kopuk ilişki bulundu.`)}}
module.exports={install,session,verifyForeignKeys,apply214,apply2141,apply215,enforceQrEligibility,normalizeReplacementVehicleStates};
