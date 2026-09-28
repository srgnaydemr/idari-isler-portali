import {getDatabase} from "@/lib/local/database";
import {normalizeQrToken} from "@/lib/vehicle-qr";
import {QrKmPublicForm} from "@/components/qr-km-public-form";

export const metadata={title:"Araç Kilometre Bildirimi",robots:{index:false,follow:false}};
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const revalidate=0;

function fmt(n:number){return Math.round(n).toLocaleString("tr-TR")}

export default async function PublicVehicleKmPage({params}:{params:Promise<{token:string}>}){
  const {token:raw}=await params;
  const token=normalizeQrToken(raw);
  const db=getDatabase();
  const row=token?db.prepare(`SELECT q.token,q.is_active,v.id vehicle_id,v.plate,v.brand,v.model,v.current_odometer,v.is_active vehicle_active
    FROM vehicle_qr_codes q JOIN vehicles v ON v.id=q.vehicle_id WHERE q.token=? AND v.is_replacement=0 LIMIT 1`).get(token) as any:null;
  if(!row||!Number(row.is_active)||!Number(row.vehicle_active)){
    return <main className="qr-public-shell"><section className="qr-public-card qr-invalid"><div className="qr-public-brand">İDARİ İŞLER PORTALI</div><div className="qr-invalid-icon">!</div><h1>QR Kodu Kullanılamıyor</h1><p>Bu QR kodu geçersiz, yenilenmiş veya devre dışı bırakılmış olabilir.</p></section></main>
  }
  const threshold=Number((db.prepare("SELECT setting_value FROM system_settings WHERE setting_key='qr_high_km_warning_delta'").get() as any)?.setting_value||10000);
  return <main className="qr-public-shell"><section className="qr-public-card">
    <div className="qr-public-brand">İDARİ İŞLER PORTALI</div>
    <div className="qr-plate">{row.plate}</div>
    <h1>Araç Kilometre Bildirimi</h1>
    <p className="qr-public-desc">Bu araç için güncel kilometreyi giriyorsunuz.</p>
    <div className="qr-current"><span>Mevcut kayıtlı KM</span><strong>{fmt(Number(row.current_odometer||0))} KM</strong></div>
    <QrKmPublicForm token={token} plate={String(row.plate)} currentOdometer={Number(row.current_odometer||0)} threshold={threshold}/>
    <footer className="qr-public-footer">{row.brand||row.model?<span>{[row.brand,row.model].filter(Boolean).join(" ")}</span>:null}<span>Yalnızca kilometre bildirimi için kullanılır.</span></footer>
  </section></main>
}
