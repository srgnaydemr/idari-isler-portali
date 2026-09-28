import {NextRequest,NextResponse} from 'next/server';
import ExcelJS from 'exceljs';
import {randomUUID} from 'node:crypto';
import {getCurrentUser} from '@/lib/local/auth';
import {getDatabase} from '@/lib/local/database';
import {sameOrigin} from '@/lib/security';
import {applyImport,planImport,personnelColumns,complianceColumns,docTypes,InputRow} from '@/lib/safe-import';
import {createLocalServerClient} from '@/lib/local/client';
import {revalidatePath} from 'next/cache';
export async function exportSheet(req:NextRequest,kind:string){
 if(!await getCurrentUser())return NextResponse.json({error:'Yetkisiz'},{status:401});
 const db=getDatabase(),wb=new ExcelJS.Workbook(),ws=wb.addWorksheet(kind==='personnel'?'Personeller':'Süre Takibi');
 ws.columns=(kind==='personnel'?personnelColumns:complianceColumns).map(header=>({header,width:26}));
 if(kind==='personnel'){
  if(req.nextUrl.searchParams.get('export')==='1'){
   ws.getColumn(8).header='_SistemKimliği';ws.getColumn(8).hidden=true;
   for(const p of db.prepare("SELECT * FROM personnel WHERE status<>'DELETED' ORDER BY last_name,first_name").all() as any[])ws.addRow([p.first_name,p.last_name,p.phone,p.company,p.branch,p.department,p.requested_documents,p.id]);
  }
 }else for(const v of db.prepare('SELECT id,plate FROM vehicles WHERE is_active=1 AND is_replacement=0 ORDER BY plate').all() as any[])ws.addRow([v.plate,...docTypes.map(t=>(db.prepare('SELECT end_date FROM vehicle_compliance_documents WHERE vehicle_id=? AND document_type=? ORDER BY (id IN (SELECT document_id FROM compliance_current)) DESC,end_date DESC,created_at DESC,id DESC LIMIT 1').get(v.id,t) as any)?.end_date||null)]);
 ws.getRow(1).font={bold:true};ws.views=[{state:'frozen',ySplit:1}];
 return new NextResponse(new Uint8Array(Buffer.from(await wb.xlsx.writeBuffer())),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${kind==='personnel'?'Personel':'Arac_Sure_Takibi'}.xlsx"`,'Cache-Control':'no-store'}});
}
export async function importSheet(req:NextRequest,kind:string){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Oturum açın.'},{status:401});
 if(!sameOrigin(req))return NextResponse.json({error:'Geçersiz istek'},{status:403});
 const db=getDatabase();
 try{
  const fd=await req.formData();
  if(fd.get('token')){
   let result:any;db.exec('BEGIN IMMEDIATE');
   try{
    const p=db.prepare('SELECT * FROM import_previews WHERE id=? AND user_id=? AND kind=? FOR UPDATE').get(String(fd.get('token')),user.id,kind) as any;
    if(!p)throw new Error('Önizleme bulunamadı.');
    if(p.applied_at)result=JSON.parse(p.result);
    else{
     if(Date.now()-Date.parse(p.created_at)>30*60*1000)throw new Error('Önizleme süresi doldu. Dosyayı yeniden yükleyin.');
     const {inputs,plan}=JSON.parse(p.payload);result=applyImport(db,kind,inputs,plan,user.id);
     db.prepare('UPDATE import_previews SET applied_at=?,result=? WHERE id=?').run(new Date().toISOString(),JSON.stringify(result),p.id);
    }db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e}
   if(kind==='compliance')await createLocalServerClient(user.id).rpc('refresh_reminder_notifications');
   revalidatePath('/','layout');return NextResponse.json({result});
  }
  const file=fd.get('file');if(!(file instanceof File)||!file.size)throw new Error('Excel dosyası seçin.');
  if(file.size>8*1024*1024)throw new Error('Dosya 8 MB sınırını aşamaz.');
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.arrayBuffer() as any);
  const ws=wb.worksheets[0];if(!ws)throw new Error('Çalışma sayfası bulunamadı.');
  if(ws.rowCount>5001)throw new Error('Bir yüklemede en fazla 5000 satır işlenebilir.');
  const headers=kind==='personnel'?personnelColumns:complianceColumns;
  headers.forEach((h,i)=>{if(ws.getRow(1).getCell(i+1).text.trim()!==h)throw new Error(`Kolon ${i+1}: ${h} bekleniyor. Güncel şablonu kullanın.`)});
  const inputs:InputRow[]=[];
  for(let i=2;i<=ws.rowCount;i++){
   const row=ws.getRow(i),values=headers.map((_,j)=>{const c=row.getCell(j+1),v=c.value;if(v instanceof Date)return v.toISOString().slice(0,10);if(v&&typeof v==='object')return c.formula?'[Formül desteklenmiyor]':c.text;return v??''});
   if(!values.some(v=>String(v).trim()))continue;
   inputs.push({row:i,values,id:kind==='personnel'&&ws.getRow(1).getCell(8).text==='_SistemKimliği'?row.getCell(8).text.trim():undefined});
  }
  if(!inputs.length)throw new Error('Dosyada veri satırı yok.');
  const plan=planImport(db,kind,inputs),token=randomUUID();
  db.prepare('INSERT INTO import_previews(id,user_id,kind,payload,created_at) VALUES(?,?,?,?,?)').run(token,user.id,kind,JSON.stringify({inputs,plan}),new Date().toISOString());
  return NextResponse.json({token,plan});
 }catch(e){console.error('SAFE_IMPORT',e);return NextResponse.json({error:e instanceof Error?e.message:'Excel okunamadı.'},{status:400})}
}
