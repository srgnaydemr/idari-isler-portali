const fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite'),{createHash}=require('node:crypto');
const mysql=require('mysql2/promise');const {config}=require('../database/mysql-config.cjs');const {install,session,verifyForeignKeys,enforceQrEligibility,normalizeReplacementVehicleStates}=require('../database/install.cjs');const {catalog,quote}=require('../database/mysql-schema.cjs');
const sourcePath=process.argv[2],reportPath=process.argv[3]||'mysql-migration-report.json';
if(!sourcePath){console.error('Kullanım: node scripts/sqlite-to-mysql.cjs /yedek/portal.db /rapor.json');process.exit(1)}
const hash=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
(async()=>{
 const source=new DatabaseSync(path.resolve(sourcePath),{readOnly:true}),c=await mysql.createConnection(config()),report={source:path.resolve(sourcePath),startedAt:new Date().toISOString(),tables:[],verified:false};
 try{
  source.exec('BEGIN');const names=source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(x=>x.name);
  const unknown=names.filter(n=>!catalog.some(t=>t.name===n)&&n!=='portal_schema_migrations');if(unknown.length)throw Error('Bilinmeyen kaynak tablolar var; hiçbir veri aktarılmadı: '+unknown.join(', '));
  for(const name of names){const model=catalog.find(t=>t.name===name);if(!model)continue;const extra=source.prepare(`PRAGMA table_info(${quote(name)})`).all().filter(x=>!model.columns.some(c=>c.name===x.name));if(extra.length)throw Error('Bilinmeyen kolonlar: '+name+'.'+extra.map(x=>x.name).join(','))}
  await install(c);await session(c);
  for(const t of catalog){const [[r]]=await c.query('SELECT count(*) n FROM '+quote(t.name));if(r.n)throw Error('Hedef boş olmalı; mevcut MySQL verisi üzerine aktarım yapılmadı: '+t.name)}
  await c.query('SET @portal_import=1, FOREIGN_KEY_CHECKS=0');await c.beginTransaction();
  try{
   for(const name of names){if(!catalog.some(t=>t.name===name))continue;const cols=source.prepare(`PRAGMA table_info(${quote(name)})`).all(),keys=cols.map(x=>x.name),order=cols.filter(x=>x.pk).sort((a,b)=>a.pk-b.pk).map(x=>quote(x.name)).join(',');
    const rows=source.prepare(`SELECT * FROM ${quote(name)}${order?' ORDER BY '+order:''}`).all();
    for(let i=0;i<rows.length;i+=200){const batch=rows.slice(i,i+200);if(batch.length)await c.query(`INSERT INTO ${quote(name)}(${keys.map(quote)}) VALUES ${batch.map(()=>`(${keys.map(()=>'?')})`).join(',')}`,batch.flatMap(r=>keys.map(k=>r[k])))}
    const [target]=await c.query(`SELECT ${keys.map(quote)} FROM ${quote(name)}${order?' ORDER BY '+order:''}`);
    const normalized=rs=>rs.map(r=>keys.map(k=>r[k]===null?null:/INT|REAL|NUM|DEC/i.test(cols.find(x=>x.name===k).type)?Number(r[k]):String(r[k]))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en'));
    const sourceHash=hash(normalized(rows)),targetHash=hash(normalized(target));if(rows.length!==target.length||sourceHash!==targetHash)throw Error(name+': sayı veya içerik doğrulaması başarısız.');
    report.tables.push({table:name,sourceCount:rows.length,targetCount:target.length,sourceHash,targetHash});
   }
   report.derived={replacementVehicles:0,replacementLinks:0,currentDocuments:0};
   const [unlinked]=await c.query('SELECT * FROM vehicle_replacement_records WHERE replacement_vehicle_id IS NULL ORDER BY created_at,id');
   for(const r of unlinked){const [matches]=await c.query("SELECT id,is_replacement FROM vehicles WHERE REPLACE(UPPER(plate),' ','')=REPLACE(UPPER(?),' ','')",[r.replacement_plate]);
    if(matches.length>1||matches.some(v=>!v.is_replacement))throw Error('İkame plakası çakışması; kaynak korunarak aktarım geri alındı: '+r.replacement_plate);
    let id=matches[0]?.id;if(!id){id='replacement:'+r.id;await c.query("INSERT INTO vehicles(id,plate,ownership_type,brand,model,model_year,vehicle_type,tire_storage_dealer,status,is_active,is_replacement,created_at,updated_at) VALUES(?,?,'FLEET','İkame','Araç',?,'İkame Araç','—','INACTIVE',0,1,?,?)",[id,r.replacement_plate,new Date().getUTCFullYear(),r.created_at,r.updated_at]);report.derived.replacementVehicles++}
    await c.query('UPDATE vehicle_replacement_records SET replacement_vehicle_id=? WHERE id=?',[id,r.id]);report.derived.replacementLinks++;
   }
   await c.query("UPDATE vehicles v SET is_active=EXISTS(SELECT 1 FROM vehicle_replacement_records r WHERE r.replacement_vehicle_id=v.id AND r.status='ACTIVE') WHERE v.is_replacement=1");
   // Initialize the new current-document pointer without changing historical documents.
   const [derived]=await c.query(`INSERT IGNORE INTO compliance_current SELECT vehicle_id,document_type,id FROM (SELECT id,vehicle_id,document_type,ROW_NUMBER() OVER(PARTITION BY vehicle_id,document_type ORDER BY end_date DESC,created_at DESC,id DESC) n FROM vehicle_compliance_documents) ranked WHERE n=1`);report.derived.currentDocuments=derived.affectedRows;
   await enforceQrEligibility(c);
   await normalizeReplacementVehicleStates(c);
   await c.query("UPDATE system_settings SET setting_value='2.15.0' WHERE setting_key='portal_version'");
   await verifyForeignKeys(c);
   await c.query("INSERT INTO portal_schema_migrations(version,ready,applied_at) VALUES('2.15.0',1,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE ready=1,applied_at=VALUES(applied_at)");
   await c.commit();report.verified=true;report.completedAt=new Date().toISOString();
  }catch(e){await c.rollback();throw e}finally{await c.query('SET FOREIGN_KEY_CHECKS=1, @portal_import=0')}
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.log('Aktarım ve tablo içerik/ilişki kontrolleri başarılı. Kaynak veritabanı değiştirilmedi. Rapor: '+reportPath);
 }catch(e){report.error=e.message;fs.writeFileSync(reportPath,JSON.stringify(report,null,2));throw e}finally{try{source.exec('ROLLBACK')}catch{}source.close();await c.end()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
