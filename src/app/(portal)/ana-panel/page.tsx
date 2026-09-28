import Link from "next/link";
import {requireUser} from "@/lib/auth";
import {SetupNotice} from "@/components/setup-notice";
import {formatNumber} from "@/lib/format";
import {notificationSeverityLabel,uiLabel} from "@/lib/labels";
import {getDatabase} from "@/lib/local/database";
import {attention} from "@/lib/local/client";
import {calculateVehicleActiveStatus} from "@/lib/local/vehicle-state";
import {expireRentalContracts} from "@/lib/rental-contract-store";
import {isoToday,parseThresholds} from "@/lib/rental-contracts";

export const dynamic="force-dynamic";
function severityPill(s:string){return s==="CRITICAL"?"red":s==="HIGH"||s==="MEDIUM"?"orange":"blue"}
function dueText(d:string){const today=isoToday(),a=Date.parse(today+"T00:00:00Z"),b=Date.parse(String(d).slice(0,10)+"T00:00:00Z"),n=Math.round((b-a)/86400000);return n<0?`${Math.abs(n)} Gün Geçti`:n===0?"Bugün":`${n} Gün`}
function alertHref(sql:any,a:any){if(a.entity_type==='vehicle')return `/araclar/${a.entity_id}`;if(a.entity_type==='traffic_fine'){const f=sql.prepare("SELECT vehicle_id FROM vehicle_traffic_fines WHERE id=?").get(a.entity_id) as any;return f?.vehicle_id?`/araclar/${f.vehicle_id}/dosyalar`:'/dikkat-gerektirenler'}if(a.entity_type==='task')return '/gorevler';if(a.entity_type==='rental_contract'){const c=sql.prepare("SELECT vehicle_id FROM vehicle_rental_contracts WHERE id=?").get(a.entity_id) as any;return c?.vehicle_id?`/araclar/${c.vehicle_id}/genel`:'/araclar?ownership=FLEET'}return '/dikkat-gerektirenler'}

export default async function Dashboard(){
  const {configured}=await requireUser(),sql=getDatabase(),today=isoToday();expireRentalContracts(sql,today);
  const vehicles=sql.prepare("SELECT id,ownership_type FROM vehicles WHERE is_active=1").all() as any[];
  const statuses=vehicles.map(v=>({id:String(v.id),status:calculateVehicleActiveStatus(sql,String(v.id))}));
  const allAlerts=attention().sort((a:any,b:any)=>(Number(b.severity_rank||0)-Number(a.severity_rank||0))||String(a.due_date||'9999').localeCompare(String(b.due_date||'9999')));
  const alerts=allAlerts.slice(0,10);
  const stats={
    total_vehicles:vehicles.length,
    service_vehicles:statuses.filter(x=>x.status==='SERVICE').length,
    attention:allAlerts.length,
    tasks:Number((sql.prepare("SELECT count(*) c FROM tasks WHERE status NOT IN ('COMPLETED','CANCELLED')").get() as any).c||0),
    fleet_vehicles:vehicles.filter(v=>v.ownership_type==='FLEET').length,
    owned_vehicles:vehicles.filter(v=>v.ownership_type==='OWNED').length,
    available_vehicles:statuses.filter(x=>x.status==='ACTIVE').length,
    assigned_vehicles:statuses.filter(x=>x.status==='ASSIGNED').length,
    vehicles_in_use:statuses.filter(x=>x.status==='TEMP_IN_USE').length
  };
  const cards=[
    ["Toplam Araç",stats.total_vehicles,"/araclar"],["Servisteki Araçlar",stats.service_vehicles,"/araclar?status=SERVICE"],["Dikkat Gerektirenler",stats.attention,"/dikkat-gerektirenler"],["Açık Görevler",stats.tasks,"/gorevler"],["Filo Araçları",stats.fleet_vehicles,"/araclar?ownership=FLEET"],["Özmal Araçlar",stats.owned_vehicles,"/araclar?ownership=OWNED"],["Boştaki Araçlar",stats.available_vehicles,"/araclar?usage=available"],["Zimmetli Araçlar",stats.assigned_vehicles,"/araclar?usage=assigned"],["Şu Anda Kullanımda Olan Araçlar",stats.vehicles_in_use,"/arac-kullanim-teslim?status=IN_USE"]
  ];
  const dueThresholds=parseThresholds((sql.prepare("SELECT setting_value FROM system_settings WHERE setting_key='rental_contract_due_thresholds'").get() as any)?.setting_value,[60,30,15,7]);
  const maxRentalDays=Math.max(...dueThresholds,30);
  const compliance=sql.prepare(`SELECT d.id,d.vehicle_id,d.document_type,d.end_date,v.plate FROM vehicle_compliance_documents d JOIN vehicles v ON v.id=d.vehicle_id WHERE v.is_active=1 AND d.document_type IN ('INSPECTION','PARKING') AND d.end_date IS NOT NULL AND date(d.end_date)<=date(?, '+30 day') ORDER BY date(d.end_date) ASC LIMIT 30`).all(today) as any[];
  const rental=sql.prepare(`SELECT c.id,c.vehicle_id,c.end_date,v.plate FROM vehicle_rental_contracts c JOIN vehicles v ON v.id=c.vehicle_id WHERE c.status='ACTIVE' AND v.is_active=1 AND v.ownership_type='FLEET' AND date(c.end_date)<=date(?, ?) ORDER BY date(c.end_date) ASC LIMIT 30`).all(today,`+${maxRentalDays} day`) as any[];
  const expiringRows=[...compliance.map(x=>({...x,label:x.document_type==='PARKING'?'Otopark':'Muayene',href:`/araclar/${x.vehicle_id}/sure-takibi`})),...rental.map(x=>({...x,label:'Kiralama Sözleşmesi',href:`/araclar/${x.vehicle_id}/genel`}))].sort((a,b)=>String(a.end_date).localeCompare(String(b.end_date))).slice(0,16);
  const title=(sql.prepare("SELECT setting_value FROM system_settings WHERE setting_key='dashboard_title'").get() as any)?.setting_value||"Ana Panel";
  return <>
    <div className="page-head"><div><h1 className="page-title">{title}</h1><div className="page-sub">Araç filosunun en önemli güncel durumları</div></div></div>
    {!configured?<SetupNotice/>:null}
    <div className="grid-kpi">{cards.map(([label,val,href])=><Link href={String(href)} className="card kpi" key={String(label)}><div className="kpi-label">{label}</div><div className="kpi-value">{formatNumber(Number(val))}</div><div className="kpi-foot">Filtreli listeyi görüntüle →</div></Link>)}</div>
    {expiringRows.length?<section className="card section table-wrap"><div className="section-head"><div><div className="section-title">Süresi Yaklaşanlar</div><div className="page-sub">Muayene, otopark ve kiralık araç sözleşme süreleri</div></div></div><table className="table"><thead><tr><th>Araç</th><th>Takip Türü</th><th>Bitiş Tarihi</th><th>Kalan Süre</th><th></th></tr></thead><tbody>{expiringRows.map((x:any)=><tr key={`${x.label}-${x.id}`}><td><Link className="link-primary" href={x.href}>{x.plate}</Link></td><td>{x.label}</td><td>{String(x.end_date).slice(0,10).split('-').reverse().join('.')}</td><td><span className={`pill ${String(dueText(x.end_date)).includes('Geçti')?'red':'orange'}`}>{dueText(x.end_date)}</span></td><td><Link className="link-primary" href={x.href}>Detaya Git →</Link></td></tr>)}</tbody></table></section>:null}
    <section className="card section attention-card"><div className="section-head"><div><div className="section-title">Dikkat Gerektirenler</div><div className="page-sub">Aktif araç süreçleri, sözleşmeler ve tarih uyarıları</div></div><Link href="/dikkat-gerektirenler" className="link-primary">Tümünü Gör</Link></div><div className="section-body"><div className="alerts">{alerts.length?alerts.map((a:any)=><Link href={alertHref(sql,a)} className="alert-row attention-row" key={a.alert_key}><div className="alert-main"><span className={`dot ${severityPill(a.severity)}`}/><div><strong className="attention-title">{a.title}</strong><div className="attention-message">{a.message}</div></div></div><span className={`pill ${severityPill(a.severity)}`}>{uiLabel(a.severity,notificationSeverityLabel)}</span></Link>):<div className="empty"><strong>Acil işlem bulunmuyor</strong>Şu anda kritik uyarı yok.</div>}</div></div></section>
  </>;
}
