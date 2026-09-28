import fs from 'node:fs';
import path from 'node:path';
import type {DatabaseSync} from 'node:sqlite';
import {MysqlDatabase} from '../mysql-database';
let instance:DatabaseSync|null=null;
function abs(value:string|undefined,fallback:string){const raw=(value||fallback).trim();return path.isAbsolute(raw)?raw:path.resolve(process.cwd(),raw)}
export function getDataDir(){return abs(process.env.PORTAL_DATA_DIR,'./storage')}
export function getUploadDir(){return abs(process.env.PORTAL_UPLOAD_DIR,path.join(getDataDir(),'uploads'))}
export function getBackupDir(){return abs(process.env.PORTAL_BACKUP_DIR,path.join(getDataDir(),'backups'))}
export function getDatabase():DatabaseSync{
 if(instance)return instance;
 for(const dir of [getDataDir(),getUploadDir(),getBackupDir()])fs.mkdirSync(dir,{recursive:true});
 if(!process.env.MYSQL_URL&&(!process.env.MYSQL_HOST||!process.env.MYSQL_DATABASE))throw new Error('MySQL yapılandırılmamış. .env dosyasını düzenleyip npm run mysql:init veya mysql:migrate çalıştırın.');
 const db=new MysqlDatabase();
 try{const marker=db.prepare("SELECT ready FROM portal_schema_migrations WHERE version='2.15.0'").get();if(!marker?.ready)throw new Error('MySQL şeması hazır değil; kurulum/aktarım tamamlanmalı.')}catch(e){db.close();throw e}
 instance=db as unknown as DatabaseSync;return instance;
}
export function getThemeSettings(){const rows=getDatabase().prepare("SELECT setting_key,setting_value FROM system_settings WHERE setting_key LIKE 'theme_%'").all() as any[];return Object.fromEntries(rows.map(r=>[r.setting_key,r.setting_value]))}
