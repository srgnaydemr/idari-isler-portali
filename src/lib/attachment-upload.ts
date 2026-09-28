import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDatabase, getUploadDir } from "@/lib/local/database";

const allowedExt = new Set([".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx"]);
const mimeByExt: Record<string,string> = {
  ".pdf":"application/pdf",".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",
  ".doc":"application/msword",".docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls":"application/vnd.ms-excel",".xlsx":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
function seg(s:string){return s.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-100)}
export function maxUpload(){return Math.max(1,Number(process.env.PORTAL_MAX_UPLOAD_MB||25))*1024*1024}
export function resolveStoredFile(p:string){const root=path.resolve(getUploadDir()),full=path.resolve(root,p);if(!full.startsWith(root+path.sep)&&full!==root)throw new Error("Geçersiz dosya yolu");return full}
async function validateSignature(file:File,ext:string){const b=Buffer.from(await file.slice(0,16).arrayBuffer());if(ext===".pdf"&&!b.subarray(0,5).equals(Buffer.from("%PDF-")))throw new Error("PDF dosyası geçersiz veya bozuk.");if((ext===".jpg"||ext===".jpeg")&&!b.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])))throw new Error("JPEG dosyası geçersiz veya bozuk.");if(ext===".png"&&!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error("PNG dosyası geçersiz veya bozuk.");if((ext===".docx"||ext===".xlsx")&&!b.subarray(0,2).equals(Buffer.from("PK")))throw new Error("Office dosyası geçersiz veya bozuk.");if((ext===".doc"||ext===".xls")&&!b.subarray(0,8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1])))throw new Error("Office dosyası geçersiz veya bozuk.")}

export async function uploadAttachmentVersion(o:{db?:any;userId:string;file:File;entityType:string;entityId:string;description?:string|null;attachmentId?:string|null}){
 const ext=path.extname(o.file.name||"").toLowerCase();
 if(!allowedExt.has(ext))throw new Error("Desteklenmeyen dosya türü.");
 if(!o.file.size)throw new Error("Boş dosya yüklenemez.");
 if(o.file.size>maxUpload())throw new Error(`Dosya en fazla ${Math.round(maxUpload()/1024/1024)} MB olabilir.`);
 await validateSignature(o.file,ext);

 const db=o.db||getDatabase();
 const isNew=!o.attachmentId;
 const aid=o.attachmentId||randomUUID();
 if(!isNew){
  const existing=db.prepare("SELECT * FROM attachments WHERE id=? AND is_active=1").get(aid) as any;
  if(!existing||existing.entity_type!==o.entityType||existing.entity_id!==o.entityId)throw new Error("Dosya kaydı bu işlemle eşleşmiyor.");
 }
 const last=isNew?{v:0}:db.prepare("SELECT MAX(version_number) AS v FROM attachment_versions WHERE attachment_id=?").get(aid) as any;
 const version=Number(last?.v||0)+1;
 const original=(o.file.name||`dosya${ext}`).slice(0,180);
 const rel=path.join(seg(o.entityType),seg(o.entityId),seg(aid),`v${version}-${randomUUID()}${ext}`);
 const full=resolveStoredFile(rel);
 await fs.mkdir(path.dirname(full),{recursive:true});
 await fs.writeFile(full,Buffer.from(await o.file.arrayBuffer()));

 try{
  db.exec("BEGIN IMMEDIATE");
  if(isNew)db.prepare("INSERT INTO attachments(id,entity_type,entity_id,description,created_by,created_at,is_active) VALUES(?,?,?,?,?,?,1)").run(aid,o.entityType,o.entityId,o.description||null,o.userId,new Date().toISOString());
  db.prepare("INSERT INTO attachment_versions(id,attachment_id,version_number,storage_path,original_filename,mime_type,file_size,uploaded_by,uploaded_at) VALUES(?,?,?,?,?,?,?,?,?)").run(randomUUID(),aid,version,rel,original,mimeByExt[ext]||"application/octet-stream",o.file.size,o.userId,new Date().toISOString());
  db.exec("COMMIT");
 }catch(e){
  try{db.exec("ROLLBACK")}catch{}
  await fs.rm(full,{force:true});
  throw e;
 }
 return{attachmentId:aid,version};
}
