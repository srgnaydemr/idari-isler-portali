export function PersonnelSnapshot({value}:{value?:string|null}){
 if(!value)return <div className="page-sub">İşlem tarihindeki şirket / şube bilgisi eski kayıtta saklanmamış.</div>;
 try{const p=JSON.parse(value);return <div className="page-sub">{[`${p.first_name||''} ${p.last_name||''}`.trim(),p.company,p.branch,p.department].filter(Boolean).join(' • ')}{p.legacy_snapshot?<small> (Güncelleme öncesi mevcut bilgi; eski işlem tarihi doğrulanamıyor.)</small>:null}</div>}catch{return null}
}
