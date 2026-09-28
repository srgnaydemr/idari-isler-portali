import {NextRequest,NextResponse} from "next/server";
import ExcelJS from "exceljs";
import {getCurrentUser} from "@/lib/local/auth";
import {getDatabase} from "@/lib/local/database";
import {tireTransactionLabel,tireTypeLabel,uiLabel} from "@/lib/labels";

export const runtime="nodejs";export const dynamic="force-dynamic";
const text=(v:unknown)=>String(v??"").trim();

export async function GET(req:NextRequest){
  const user=await getCurrentUser();if(!user)return NextResponse.redirect(new URL("/login",req.url));
  const u=new URL(req.url),q=text(u.searchParams.get("q")),vehicle=text(u.searchParams.get("vehicle")),type=text(u.searchParams.get("type")),start=text(u.searchParams.get("start")),end=text(u.searchParams.get("end"));
  const where:string[]=["1=1"],args:any[]=[];
  if(q){where.push("(v.plate LIKE ? COLLATE NOCASE OR COALESCE(t.brand,'') LIKE ? COLLATE NOCASE OR COALESCE(t.model,'') LIKE ? COLLATE NOCASE OR COALESCE(t.storage_dealer,'') LIKE ? COLLATE NOCASE OR COALESCE(t.description,'') LIKE ? COLLATE NOCASE OR COALESCE(t.performed_by_name,'') LIKE ? COLLATE NOCASE)");for(let i=0;i<6;i++)args.push(`%${q}%`)}
  if(vehicle){where.push("t.vehicle_id=?");args.push(vehicle)}if(type){where.push("t.tire_type=?");args.push(type)}if(start){where.push("substr(t.transaction_date,1,10)>=?");args.push(start)}if(end){where.push("substr(t.transaction_date,1,10)<=?");args.push(end)}
  const rows=getDatabase().prepare(`SELECT t.*,v.plate FROM vehicle_tire_transactions t JOIN vehicles v ON v.id=t.vehicle_id WHERE ${where.join(" AND ")} ORDER BY t.transaction_date DESC,COALESCE(t.transaction_time,'') DESC,t.created_at DESC`).all(...args) as any[];
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet("Lastik Hareketleri");
  ws.columns=[
    {header:"Tarih",key:"date",width:14},{header:"Saat",key:"time",width:10},{header:"Plaka",key:"plate",width:16},{header:"KM",key:"km",width:14},{header:"Lastik Türü",key:"tire",width:18},{header:"Marka",key:"brand",width:18},{header:"Model",key:"model",width:18},{header:"Ölçü",key:"size",width:16},{header:"Adet",key:"qty",width:10},{header:"İşlem",key:"op",width:22},{header:"İşlemi Yapan Kişi",key:"person",width:24},{header:"Maliyet",key:"cost",width:14},{header:"Lastik Bayisi",key:"dealer",width:24},{header:"Depo Bayisi",key:"storage",width:24},{header:"Açıklama",key:"desc",width:36}
  ];
  for(const r of rows)ws.addRow({date:r.transaction_date,time:r.transaction_time||"",plate:r.plate,km:Number(r.odometer||0),tire:uiLabel(r.tire_type,tireTypeLabel),brand:r.brand||"",model:r.model||"",size:r.size||"",qty:Number(r.quantity||0),op:uiLabel(r.transaction_type,tireTransactionLabel),person:r.performed_by_name||"",cost:Number(r.cost||0),dealer:r.tire_dealer||"",storage:r.storage_dealer||"",desc:r.description||""});
  ws.getRow(1).font={bold:true};ws.views=[{state:"frozen",ySplit:1}];ws.autoFilter={from:"A1",to:"O1"};
  const buf=await wb.xlsx.writeBuffer();return new NextResponse(buf as BodyInit,{status:200,headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="lastik-hareketleri-${new Date().toISOString().slice(0,10)}.xlsx"`,"Cache-Control":"no-store"}});
}
