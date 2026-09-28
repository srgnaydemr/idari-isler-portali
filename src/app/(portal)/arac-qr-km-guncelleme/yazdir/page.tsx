import {requireUser} from "@/lib/auth";
import {getDatabase} from "@/lib/local/database";
import {PrintButton} from "@/components/print-button";
import Link from "next/link";

export const dynamic="force-dynamic";
export const revalidate=0;

export default async function VehicleQrPrintPage({searchParams}:{searchParams:Promise<{vehicle_id?:string}>}){
  await requireUser();const sp=await searchParams;const db=getDatabase();
  const rows=sp.vehicle_id?db.prepare(`SELECT v.id,v.plate,v.brand,v.model FROM vehicles v JOIN vehicle_qr_codes q ON q.vehicle_id=v.id WHERE v.id=? AND q.is_active=1 AND v.is_active=1 AND v.is_replacement=0`).all(sp.vehicle_id) as any[]:db.prepare(`SELECT v.id,v.plate,v.brand,v.model FROM vehicles v JOIN vehicle_qr_codes q ON q.vehicle_id=v.id WHERE q.is_active=1 AND v.is_active=1 AND v.is_replacement=0 ORDER BY v.plate`).all() as any[];
  return <div className="qr-print-page"><div className="page-header print-hide"><div><h1>QR Kodlarını Yazdır</h1><div className="page-sub">Etiketleri yazdırabilir veya tarayıcıdan PDF olarak kaydedebilirsiniz.</div></div><div className="header-actions"><Link className="btn btn-secondary" href="/arac-qr-km-guncelleme">Geri Dön</Link><PrintButton/></div></div><div className="qr-print-grid">{rows.map(r=><article className="qr-print-label" key={r.id}><div className="qr-label-brand">İDARİ İŞLER PORTALI</div><img src={`/api/vehicle-qr/image?vehicle_id=${r.id}`} alt={`${r.plate} QR`}/><strong>{r.plate}</strong><span>Güncel KM Bildirmek İçin Okutun</span></article>)}</div>{!rows.length?<div className="empty print-hide">Yazdırılabilecek aktif QR kodu bulunmuyor.</div>:null}</div>
}
