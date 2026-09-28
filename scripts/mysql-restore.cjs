const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),mysql=require('mysql2/promise');
const {config}=require('../database/mysql-config.cjs'),{install,verifyForeignKeys,enforceQrEligibility,normalizeReplacementVehicleStates}=require('../database/install.cjs'),{quote,catalog}=require('../database/mysql-schema.cjs');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
(async()=>{
 if(!process.argv[2])throw Error('Kullanım: npm run restore -- /yedek-klasörü. Hedef boş MySQL veritabanı ve boş veri klasörü olmalı.');
 const dir=path.resolve(process.argv[2]),data=path.resolve(process.env.PORTAL_DATA_DIR||'storage'),backup=JSON.parse(fs.readFileSync(path.join(dir,'mysql-backup.json'),'utf8'));
 if(!['portal-mysql-2.13','portal-mysql-2.14','portal-mysql-2.15'].includes(backup.format))throw Error('Desteklenmeyen yedek.');
 for(const t of backup.tables){if(!catalog.some(x=>x.name===t.name)&&t.name!=='portal_schema_migrations')throw Error('Bilinmeyen tablo: '+t.name);if(hash(t.rows)!==t.sha256)throw Error('Yedek özeti uyuşmuyor: '+t.name)}
 for(const f of backup.files){const p=path.resolve(dir,f.path);if(!p.startsWith(dir+path.sep)||!/^uploads\/|^branding\//.test(f.path)||crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')!==f.sha256)throw Error('Dosya doğrulanamadı: '+f.path)}
 const upload=path.resolve(process.env.PORTAL_UPLOAD_DIR||path.join(data,'uploads')),branding=path.join(data,'branding');
 for(const p of [upload,branding])if(fs.existsSync(p)&&fs.readdirSync(p).length)throw Error('Dosya hedefi boş değil: '+p);
 const c=await mysql.createConnection({...config(),decimalNumbers:false,bigNumberStrings:true});
 try{await install(c);for(const t of catalog){const [[r]]=await c.query('SELECT COUNT(*) n FROM '+quote(t.name));if(Number(r.n))throw Error('Hedef MySQL boş değil: '+t.name)}
  await c.query('SET @portal_import=1, FOREIGN_KEY_CHECKS=0');await c.beginTransaction();
  try{for(const t of backup.tables){if(t.name==='portal_schema_migrations')continue;for(let i=0;i<t.rows.length;i+=200){const rows=t.rows.slice(i,i+200),keys=Object.keys(rows[0]);await c.query(`INSERT INTO ${quote(t.name)}(${keys.map(quote)}) VALUES ${rows.map(()=>`(${keys.map(()=>'?')})`)}`,rows.flatMap(r=>keys.map(k=>r[k])))}const [rows]=await c.query('SELECT * FROM '+quote(t.name));const canon=rs=>rs.map(r=>JSON.stringify(Object.keys(r).sort().map(k=>[k,r[k]]))).sort();if(hash(canon(rows))!==hash(canon(t.rows)))throw Error('Geri yükleme doğrulaması başarısız: '+t.name)}
   await verifyForeignKeys(c);
   for(const f of backup.files){const parts=f.path.split('/'),base=parts.shift()==='uploads'?upload:branding,target=path.resolve(base,...parts);if(!target.startsWith(base+path.sep))throw Error('Geçersiz dosya yolu');fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(dir,f.path),target,fs.constants.COPYFILE_EXCL)}
   await enforceQrEligibility(c);await normalizeReplacementVehicleStates(c);await c.query("UPDATE system_settings SET setting_value='2.15.0' WHERE setting_key='portal_version'");await c.query("INSERT INTO portal_schema_migrations(version,ready,applied_at) VALUES('2.15.0',1,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE ready=1,applied_at=VALUES(applied_at)");await c.commit();console.log('Veritabanı, ilişkiler, içerik ve dosya özetleri doğrulanarak geri yüklendi.');
  }catch(e){await c.rollback();throw e}finally{await c.query('SET FOREIGN_KEY_CHECKS=1, @portal_import=0')}
 }finally{await c.end()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
