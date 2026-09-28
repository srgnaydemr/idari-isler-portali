import {NextRequest,NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/local/auth";
import {getDatabase} from "@/lib/local/database";
import {qrSvg} from "@/lib/qr-svg";
import {qrPublicOriginFromHeaders,vehicleQrPublicUrl} from "@/lib/vehicle-qr";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(req:NextRequest){
  const user=await getCurrentUser();
  if(!user)return new NextResponse("Yetkisiz",{status:401});
  const vehicleId=String(req.nextUrl.searchParams.get("vehicle_id")||"");
  const row=getDatabase().prepare(`SELECT q.token,q.is_active,v.plate FROM vehicle_qr_codes q JOIN vehicles v ON v.id=q.vehicle_id WHERE q.vehicle_id=? AND v.is_replacement=0 LIMIT 1`).get(vehicleId) as any;
  if(!row)return new NextResponse("QR bulunamadı",{status:404});
  const origin=qrPublicOriginFromHeaders(req.headers,req.nextUrl.origin);
  let svg:string;
  try{svg=qrSvg(vehicleQrPublicUrl(origin,String(row.token)),{scale:10,quiet:4})}catch(e:any){return new NextResponse(String(e?.message||"QR üretilemedi"),{status:422})}
  const safePlate=String(row.plate||"arac").replace(/[^A-Za-z0-9_-]+/g,"-");
  const headers=new Headers({"Content-Type":"image/svg+xml; charset=utf-8","Cache-Control":"no-store, max-age=0","X-Content-Type-Options":"nosniff"});
  if(req.nextUrl.searchParams.get("download")==="1")headers.set("Content-Disposition",`attachment; filename=\"${safePlate}-km-qr.svg\"`);
  return new NextResponse(svg,{status:200,headers});
}
