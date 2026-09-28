import { formatDateTime, formatNumber } from "@/lib/format";
import { PersonnelSnapshot } from "@/components/personnel-snapshot";
import { SubmitButton } from "@/components/submit-button";

type Props = {
  records: any[];
  uses?: any[];
  action: (fd: FormData) => Promise<void> | void;
  canCreate: boolean;
  nowLocal: string;
  title?: string;
};

function ReplacementFields({prefix="",record,nowLocal}:{prefix?:string;record?:any;nowLocal:string}){
  return <div className="form-grid">
    <div className="field"><label>İkame Plaka *</label><input className="input" name={`${prefix}replacement_plate`} defaultValue={record?.replacement_plate||""} required/></div>
    <div className="field"><label>Marka / Model</label><input className="input" name={`${prefix}replacement_brand_model`} defaultValue={record?.replacement_brand_model||""}/></div>
    <div className="field"><label>Başlangıç Tarihi / Saati *</label><input className="input" type="datetime-local" max={nowLocal} name={`${prefix}replacement_received_at`} defaultValue={record?.replacement_received_at?String(record.replacement_received_at).slice(0,16):""} required/></div>
    <div className="field"><label>Başlangıç KM (isteğe bağlı)</label><input className="input" type="number" min="0" name={`${prefix}replacement_odometer`} defaultValue={record?.replacement_odometer??""}/></div>
    <div className="field"><label>İkameyi Sağlayan Firma</label><input className="input" name={`${prefix}replacement_company`} defaultValue={record?.replacement_company||""}/></div>
    <div className="field" style={{gridColumn:"1/-1"}}><label>Açıklama / Not</label><textarea className="textarea" rows={2} name={`${prefix}replacement_notes`} defaultValue={record?.replacement_notes||""}/></div>
  </div>;
}
function ReturnFields({prefix="",record,nowLocal}:{prefix?:string;record:any;nowLocal:string}){
  return <div className="form-grid">
    <input type="hidden" name={`${prefix}record_id`} value={record.id}/>
    <div className="field"><label>İade Tarihi / Saati *</label><input className="input" type="datetime-local" min={record.replacement_received_at?String(record.replacement_received_at).slice(0,16):undefined} max={nowLocal} name={`${prefix}replacement_returned_at`} required/></div>
    <div className="field"><label>İade KM (isteğe bağlı)</label><input className="input" type="number" min={record.replacement_odometer??0} name={`${prefix}replacement_return_odometer`}/></div>
    <div className="field"><label>İade Nedeni *</label><input className="input" name={`${prefix}return_reason`} placeholder="Örn. araç arızası, servis tamamlandı" required/></div>
    <div className="field" style={{gridColumn:"1/-1"}}><label>İade Açıklaması</label><textarea className="textarea" rows={2} name={`${prefix}return_notes`}/></div>
  </div>;
}

export function ReplacementManager({records,uses=[],action,canCreate,nowLocal,title="İkame Araç Yönetimi"}:Props){
  const active=records.find(r=>r.status==="ACTIVE"&&!r.replacement_returned_at);
  const usageFor=(id:string)=>uses.filter(u=>u.replacement_record_id===id);
  return <section className="card section">
    <div className="section-head"><div><div className="section-title">{title}</div><div className="page-sub">Bilgi düzeltmesi mevcut kaydı korur. Gerçek araç değişiminde eski ikame iade edilir ve yeni ikame ayrı kayıt olarak açılır.</div></div>{active?<span className="pill blue">Aktif: {active.replacement_plate}</span>:<span className="pill gray">Aktif ikame yok</span>}</div>
    <div className="section-body">
      {!active && canCreate ? <form action={action}><input type="hidden" name="operation" value="create"/><ReplacementFields nowLocal={nowLocal}/><div className="form-actions"><SubmitButton>İkame Araç Ekle</SubmitButton></div></form>:null}
      {!active && !canCreate ? <div className="warning-box">Yeni ikame araç eklemek için ilgili araç önce servis sürecinde olmalıdır.</div>:null}
      {active ? <>
        <details className="section" open><summary className="link-primary"><strong>İkame Araç Bilgilerini Düzenle</strong></summary><form action={action} className="section"><input type="hidden" name="operation" value="edit"/><input type="hidden" name="record_id" value={active.id}/><ReplacementFields record={active} nowLocal={nowLocal}/><div className="form-actions"><SubmitButton className="btn btn-secondary">Bilgileri Güncelle</SubmitButton></div></form></details>
        <details className="section"><summary className="link-primary"><strong>İkame Aracı İade Et</strong></summary><form action={action} className="section"><input type="hidden" name="operation" value="return"/><ReturnFields record={active} nowLocal={nowLocal}/><div className="form-actions"><SubmitButton>İade İşlemini Tamamla</SubmitButton></div></form></details>
        <details className="section"><summary className="link-primary"><strong>İkame Aracı Değiştir</strong></summary><form action={action} className="section"><input type="hidden" name="operation" value="change"/><div className="notice"><strong>Eski İkame Araç — {active.replacement_plate}</strong><ReturnFields prefix="old_" record={active} nowLocal={nowLocal}/></div><div className="section-title" style={{marginTop:18}}>Yeni İkame Araç</div><ReplacementFields prefix="new_" nowLocal={nowLocal}/><div className="form-actions"><SubmitButton>Eski Aracı İade Et ve Yeni İkameyi Aç</SubmitButton></div></form></details>
      </>:null}
      <div className="section-title" style={{marginTop:22}}>İkame Araç Geçmişi</div>
      <div className="table-wrap section"><table className="table"><thead><tr><th>Plaka</th><th>Marka / Model</th><th>Başlangıç</th><th>Başlangıç KM</th><th>İade</th><th>İade KM</th><th>İade Nedeni</th><th>Kullanım</th><th>Durum</th></tr></thead><tbody>{records.map(r=>{const ru=usageFor(r.id);return <tr key={r.id}><td><strong>{r.replacement_plate}</strong></td><td>{r.replacement_brand_model||"—"}</td><td>{formatDateTime(r.replacement_received_at)}</td><td>{r.replacement_odometer==null?"—":formatNumber(r.replacement_odometer)}</td><td>{formatDateTime(r.replacement_returned_at)}</td><td>{r.replacement_return_odometer==null?"—":formatNumber(r.replacement_return_odometer)}</td><td>{r.return_reason||"—"}{r.return_notes?<div className="page-sub">{r.return_notes}</div>:null}</td><td>{ru.length?ru.map(u=><div key={u.id} className="page-sub"><strong>{u.personnel_name_snapshot}</strong><PersonnelSnapshot value={u.personnel_snapshot}/> • {formatDateTime(u.checkout_at)} → {u.return_at?formatDateTime(u.return_at):"Kullanımda"}</div>):"—"}</td><td><span className={`pill ${r.status==="ACTIVE"?"blue":"green"}`}>{r.status==="ACTIVE"?"Aktif":"İade Edildi"}</span></td></tr>})}</tbody></table>{!records.length?<div className="empty">Henüz ikame araç kaydı bulunmuyor.</div>:null}</div>
    </div>
  </section>;
}
