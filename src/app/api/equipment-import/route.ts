import {NextRequest,NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import ExcelJS from "exceljs";
import {getCurrentUser} from "@/lib/local/auth";
import {getDatabase} from "@/lib/local/database";
import {localRedirectUrl} from "@/lib/local/redirect-url";
import {sameOrigin} from "@/lib/security";
import {auditAction} from "@/lib/audit";
import {nextEquipmentAssetTag} from "@/lib/equipment";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const text=(v:any)=>String(v??"").trim();
function cell(row:any,n:number){const v=row.getCell(n).value as any;if(v==null)return"";if(typeof v==="object"&&"text"in v)return text(v.text);if(typeof v==="object"&&"result"in v)return text(v.result);return text(v)}
function low(v:string){return v.toLocaleLowerCase("tr-TR")}
function redirectResult(req:NextRequest,imported:number,errors:string[]){const u=localRedirectUrl(req,"/personel-zimmetleri");u.searchParams.set("imported",String(imported));u.searchParams.set("failed",String(errors.length));if(errors.length)u.searchParams.set("import_errors",errors.slice(0,6).join(" • "));return NextResponse.redirect(u,303)}

export async function GET(){
 const user=await getCurrentUser();if(!user)return new NextResponse("Yetkisiz",{status:401});
 const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet("Ekipmanlar");
 ws.columns=[
  {header:"Ekipman Türü",key:"type",width:20},{header:"Marka",key:"brand",width:18},{header:"Model",key:"model",width:18},
  {header:"Seri No",key:"serial",width:22},{header:"IMEI 1",key:"imei",width:20},{header:"IMEI 2",key:"imei2",width:20},
  {header:"Ekran Boyutu",key:"screen",width:16},{header:"Cihaz Türü",key:"subtype",width:18},
  {header:"Açıklama",key:"desc",width:28},{header:"Durum",key:"status",width:16}
 ];
 ws.addRow({type:"Telefon",brand:"Apple",model:"iPhone",serial:"SN-001",imei:"111111111111111",imei2:"222222222222222",desc:"Örnek kayıt",status:"Havuzda"});
 ws.addRow({type:"Monitör",brand:"Dell",model:"P2723",serial:"MON-001",screen:'27"',status:"Hasarlı"});
 ws.getRow(1).font={bold:true};ws.views=[{state:"frozen",ySplit:1}];
 const buf=Buffer.from(await wb.xlsx.writeBuffer());
 return new NextResponse(new Uint8Array(buf),{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":'attachment; filename="Ekipman_Excel_Sablonu.xlsx"',"Cache-Control":"no-store"}});
}

export async function POST(req:NextRequest){
 const user=await getCurrentUser();if(!user)return NextResponse.redirect(localRedirectUrl(req,"/login"),303);
 if(!sameOrigin(req))return new NextResponse("Geçersiz istek",{status:403});
 const fd=await req.formData(),file=fd.get("file");if(!(file instanceof File)||!file.size)return redirectResult(req,0,["Excel dosyası seçilmedi."]);
 if(file.size>8*1024*1024)return redirectResult(req,0,["Excel dosyası 8 MB sınırını aşamaz."]);
 try{
  const wb=new ExcelJS.Workbook();await wb.xlsx.load((await file.arrayBuffer()) as unknown as Parameters<typeof wb.xlsx.load>[0]);const ws=wb.worksheets[0];if(!ws)return redirectResult(req,0,["Excel içinde çalışma sayfası bulunamadı."]);
  const db=getDatabase(),types=(db.prepare("SELECT name FROM system_definitions WHERE category='equipment_type' AND is_active=1").all() as any[]).map(x=>String(x.name));
  const typeMap=new Map(types.map(x=>[low(x),x]));
  const existing={serial:new Set<string>(),imei:new Set<string>()};
  for(const x of db.prepare("SELECT serial_number,imei,imei2 FROM equipment").all() as any[]){if(x.serial_number)existing.serial.add(low(String(x.serial_number)));if(x.imei)existing.imei.add(low(String(x.imei)));if(x.imei2)existing.imei.add(low(String(x.imei2)))}
  const seen={serial:new Set<string>(),imei:new Set<string>()},valid:any[]=[],errors:string[]=[];
  for(let i=2;i<=ws.rowCount;i++){const row=ws.getRow(i),rawType=cell(row,1),brand=cell(row,2),model=cell(row,3),serial=cell(row,4),imei=cell(row,5),imei2=cell(row,6),screen=cell(row,7),subtype=cell(row,8),desc=cell(row,9),statusRaw=cell(row,10);if(![rawType,brand,model,serial,imei,imei2,screen,subtype,desc,statusRaw].some(Boolean))continue;
   const type=typeMap.get(low(rawType));if(!type){errors.push(`Satır ${i} – Ekipman türü geçersiz veya eksik.`);continue}
   const mobile=low(type).includes("telefon")||low(type).includes("tablet");if(mobile&&(!brand||!serial)){errors.push(`Satır ${i} – Telefon / tablet için Marka ve Seri No zorunludur.`);continue}
   if(imei&&imei2&&low(imei)===low(imei2)){errors.push(`Satır ${i} – IMEI 1 ve IMEI 2 aynı olamaz.`);continue}
   let conflict="";if(serial&&(existing.serial.has(low(serial))||seen.serial.has(low(serial))))conflict="Seri No";else if(imei&&(existing.imei.has(low(imei))||seen.imei.has(low(imei))))conflict="IMEI 1";else if(imei2&&(existing.imei.has(low(imei2))||seen.imei.has(low(imei2))))conflict="IMEI 2";
   if(conflict){errors.push(`Satır ${i} – ${conflict} sistemde veya dosyada zaten kayıtlı.`);continue}
   if(serial)seen.serial.add(low(serial));if(imei)seen.imei.add(low(imei));if(imei2)seen.imei.add(low(imei2));
   const st=low(statusRaw),status=st.includes("hasar")?"DAMAGED":st.includes("servis")?"SERVICE":st.includes("kullanım dış")||st.includes("pasif")?"INACTIVE":"AVAILABLE";
   valid.push({id:randomUUID(),type,brand:brand||null,model:model||null,serial:serial||null,imei:mobile&&imei?imei:null,imei2:mobile&&imei2?imei2:null,screen:screen||null,subtype:subtype||null,desc:desc||null,status});
  }
  const now=new Date().toISOString();db.exec("BEGIN IMMEDIATE");try{const stmt=db.prepare("INSERT INTO equipment(id,equipment_type,brand,model,serial_number,imei,imei2,asset_tag,screen_size,device_subtype,description,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");for(const x of valid){const asset=nextEquipmentAssetTag(db,x.type);stmt.run(x.id,x.type,x.brand,x.model,x.serial,x.imei,x.imei2,asset,x.screen,x.subtype,x.desc,x.status,user.id,now,now)}db.exec("COMMIT")}catch(e){db.exec("ROLLBACK");throw e}
  auditAction(user,"Excel ile Ekipman Yüklendi","equipment_import",randomUUID(),"Toplu ekipman yükleme",null,{imported:valid.length,failed:errors.length});
  return redirectResult(req,valid.length,errors);
 }catch(e){console.error("EQUIPMENT_IMPORT_ERROR",e);return redirectResult(req,0,["Excel dosyası okunamadı. Şablonu kullanarak tekrar deneyin."])}
}
