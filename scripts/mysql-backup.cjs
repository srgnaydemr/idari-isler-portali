const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),mysql=require('mysql2/promise');
const {config}=require('../database/mysql-config.cjs'),{session}=require('../database/install.cjs'),{quote}=require('../database/mysql-schema.cjs');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
(async()=>{
 const data=path.resolve(process.env.PORTAL_DATA_DIR||'storage'),root=path.resolve(process.env.PORTAL_BACKUP_DIR||path.join(data,'backups'));
 const dest=path.resolve(process.argv[2]||path.join(root,'MySQL_'+new Date().toISOString().replace(/[:.]/g,'-')));
 if(fs.existsSync(dest))throw Error('Yedek hedefi mevcut; yeni bir klasör seçin.');fs.mkdirSync(dest,{recursive:true});
 const c=await mysql.createConnection({...config(),decimalNumbers:false,bigNumberStrings:true}),backup={format:'portal-mysql-2.15',createdAt:new Date().toISOString(),tables:[],files:[]};
 try{await session(c);await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
  const [tables]=await c.query('SHOW FULL TABLES WHERE Table_type=\'BASE TABLE\'');
  for(const t of tables){const name=Object.values(t)[0];const [rows]=await c.query('SELECT * FROM '+quote(name));backup.tables.push({name,rows,sha256:hash(rows)})}
  for(const [name,src] of [['uploads',path.resolve(process.env.PORTAL_UPLOAD_DIR||path.join(data,'uploads'))],['branding',path.join(data,'branding')]])if(fs.existsSync(src)){
   const walk=(dir,rel='')=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('Yedeklemede sembolik bağlantı desteklenmiyor: '+e.name);const p=path.join(dir,e.name),r=path.join(rel,e.name);if(e.isDirectory())walk(p,r);else{const target=path.join(dest,name,r);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(p,target);backup.files.push({path:path.join(name,r).replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')})}}};walk(src);
  }
  await c.commit();fs.writeFileSync(path.join(dest,'mysql-backup.json'),JSON.stringify(backup));console.log('MySQL + dosya yedeği: '+dest);
 }catch(e){await c.rollback();throw e}finally{await c.end()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
