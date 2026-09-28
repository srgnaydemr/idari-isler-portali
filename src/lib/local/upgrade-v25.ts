import type {DatabaseSync} from "node:sqlite";
import {randomUUID} from "node:crypto";

function hasColumn(db:DatabaseSync,table:string,column:string){return (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).some(x=>x.name===column)}
function addColumn(db:DatabaseSync,table:string,column:string,sql:string){if(!hasColumn(db,table,column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sql}`)}
function today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}

function inferLegacyReferenceKm(db:DatabaseSync,vehicleId:string,startDate:string,current:number){
  const before=db.prepare("SELECT new_odometer FROM vehicle_odometer_history WHERE vehicle_id=? AND date(recorded_at)<=date(?) ORDER BY datetime(recorded_at) DESC LIMIT 1").get(vehicleId,startDate) as any;
  if(before?.new_odometer!=null)return Math.max(0,Number(before.new_odometer));
  const after=db.prepare("SELECT previous_odometer,new_odometer FROM vehicle_odometer_history WHERE vehicle_id=? ORDER BY datetime(recorded_at) ASC LIMIT 1").get(vehicleId) as any;
  if(after)return Math.max(0,Number(after.previous_odometer??after.new_odometer??current));
  return Math.max(0,current);
}

/** V2.5 merkezi sözleşme kaynağı + KM havuzu. Additive; operasyon verileri silinmez. */
export function upgradeV25(db:DatabaseSync){
  const now=new Date().toISOString();
  addColumn(db,"vehicle_rental_contracts","reference_source","TEXT NOT NULL DEFAULT 'AUTO'");
  db.exec(`
    CREATE TABLE IF NOT EXISTS rental_km_pools(
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      fleet_company TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      total_km_allowance INTEGER NOT NULL CHECK(total_km_allowance>=0),
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      notes TEXT,
      created_by TEXT REFERENCES users(id),
      closed_by TEXT REFERENCES users(id),
      closed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rental_km_pools_status ON rental_km_pools(status,end_date);
    CREATE TABLE IF NOT EXISTS rental_km_pool_members(
      id TEXT PRIMARY KEY,
      pool_id TEXT NOT NULL REFERENCES rental_km_pools(id),
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      reference_odometer INTEGER NOT NULL CHECK(reference_odometer>=0),
      joined_at TEXT NOT NULL,
      left_at TEXT,
      exit_odometer INTEGER,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rental_km_pool_members_pool ON rental_km_pool_members(pool_id,joined_at);
    CREATE INDEX IF NOT EXISTS idx_rental_km_pool_members_vehicle ON rental_km_pool_members(vehicle_id,joined_at);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_rental_km_pool_active_vehicle ON rental_km_pool_members(vehicle_id) WHERE left_at IS NULL;
  `);

  // V2.4 ve daha eski verilerde Araç Genel Bilgilerinde sözleşme mevcut olup takip tablosu yoksa geçmişi bozmadan otomatik başlat.
  const vehicles=db.prepare(`SELECT id,fleet_company,contract_start_date,contract_end_date,contract_km_limit,current_odometer
    FROM vehicles WHERE is_active=1 AND ownership_type='FLEET' AND fleet_company IS NOT NULL
      AND contract_start_date IS NOT NULL AND contract_end_date IS NOT NULL AND contract_km_limit IS NOT NULL`).all() as any[];
  const insert=db.prepare(`INSERT INTO vehicle_rental_contracts(id,vehicle_id,fleet_company,start_date,end_date,start_odometer,total_km_allowance,status,notes,created_by,created_at,updated_at,reference_source)
    VALUES(?,?,?,?,?,?,?,?,'V2.5 geçişinde Araç Genel Bilgilerinden otomatik eşitlendi.',NULL,?,?,?)`);
  for(const v of vehicles){
    const active=db.prepare("SELECT * FROM vehicle_rental_contracts WHERE vehicle_id=? AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1").get(v.id) as any;
    const same=db.prepare("SELECT * FROM vehicle_rental_contracts WHERE vehicle_id=? AND start_date=? ORDER BY datetime(created_at) DESC LIMIT 1").get(v.id,v.contract_start_date) as any;
    const expired=String(v.contract_end_date)<today();
    const target=active||same;
    if(target){
      db.prepare("UPDATE vehicle_rental_contracts SET fleet_company=?,start_date=?,end_date=?,total_km_allowance=?,status=?,closed_at=CASE WHEN ?='EXPIRED' THEN COALESCE(closed_at,?) ELSE closed_at END,end_odometer=CASE WHEN ?='EXPIRED' THEN COALESCE(end_odometer,?) ELSE end_odometer END,updated_at=?,reference_source=COALESCE(reference_source,'AUTO_MIGRATED') WHERE id=?")
        .run(v.fleet_company,v.contract_start_date,v.contract_end_date,Number(v.contract_km_limit||0),expired?'EXPIRED':'ACTIVE',expired?'EXPIRED':'ACTIVE',now,expired?'EXPIRED':'ACTIVE',Number(v.current_odometer||0),now,target.id);
    }else{
      const ref=inferLegacyReferenceKm(db,v.id,String(v.contract_start_date),Number(v.current_odometer||0));
      insert.run(randomUUID(),v.id,v.fleet_company,v.contract_start_date,v.contract_end_date,ref,Number(v.contract_km_limit||0),expired?'EXPIRED':'ACTIVE',now,now,'AUTO_MIGRATED');
    }
  }

  db.prepare("INSERT INTO report_catalog(slug,name,report_type,category,description,sort_order,is_active,created_at) VALUES('rental-km-tracking','Kiralık Araç KM ve Havuz Takibi','Excel / Takip','Araç Raporları','Tekil kiralık araçlar ve ortak KM havuzlarının sözleşme, kullanım, tahmin ve risk durumlarını gösterir.',38,1,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name,report_type=excluded.report_type,category=excluded.category,description=excluded.description,sort_order=excluded.sort_order,is_active=1").run(now);
  db.prepare("INSERT INTO system_settings(setting_key,setting_value,setting_label,updated_at) VALUES('portal_version','2.5.0','Portal sürümü',?) ON CONFLICT(setting_key) DO UPDATE SET setting_value='2.5.0',setting_label='Portal sürümü',updated_at=excluded.updated_at").run(now);
}
