"use client";
import {FormEvent,useState} from "react";

function fmt(n:number){return Math.round(n).toLocaleString("tr-TR")}

export function QrKmPublicForm({token,plate,currentOdometer,threshold}:{token:string;plate:string;currentOdometer:number;threshold:number}){
  const [current,setCurrent]=useState(Number(currentOdometer||0));
  const [value,setValue]=useState(String(currentOdometer||""));
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState(false);
  const [success,setSuccess]=useState(false);
  const [confirm,setConfirm]=useState<{difference:number;newOdometer:number;message:string}|null>(null);

  async function submit(confirmHigh=false){
    const km=Number(value);
    if(!Number.isSafeInteger(km)||km<0){setError(true);setMessage("Lütfen geçerli bir kilometre değeri girin.");return}
    setBusy(true);setMessage("");setError(false);
    try{
      const res=await fetch("/api/public/vehicle-km",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,odometer:km,confirmHigh})});
      const data=await res.json().catch(()=>({message:"İşlem sırasında bir sorun oluştu."}));
      if(data.requiresConfirmation){setConfirm({difference:Number(data.difference||0),newOdometer:km,message:String(data.message||"")});setBusy(false);return}
      setConfirm(null);
      if(!res.ok||!data.ok){setError(true);setMessage(String(data.message||"İşlem sırasında bir sorun oluştu."));return}
      const next=Number(data.currentOdometer??km);
      setCurrent(next);setValue(String(next));setSuccess(!data.unchanged);setError(false);setMessage(String(data.message||"Kilometre başarıyla güncellendi."));
    }catch{setError(true);setMessage("Bağlantı sırasında bir sorun oluştu. Lütfen tekrar deneyin.")}
    finally{setBusy(false)}
  }

  function onSubmit(e:FormEvent){e.preventDefault();setSuccess(false);void submit(false)}

  return <>
    <form onSubmit={onSubmit} className="qr-public-form" data-allow-duplicate-submit="1">
      <label htmlFor="qr-km">Güncel KM</label>
      <div className="qr-km-input-wrap"><input id="qr-km" inputMode="numeric" pattern="[0-9]*" type="number" min={current} step="1" value={value} onChange={e=>{setValue(e.target.value);setMessage("");setError(false);setSuccess(false)}} aria-describedby="qr-km-help" required/><span>KM</span></div>
      <div id="qr-km-help" className="qr-help">Mevcut kayıtlı KM'den düşük bir değer kaydedilemez.</div>
      <button type="submit" className="qr-submit" disabled={busy}>{busy?"Kaydediliyor…":"KM'yi Güncelle"}</button>
    </form>
    {message?<div className={`qr-result ${error?"error":success?"success":"info"}`}><strong>{error?"İşlem tamamlanamadı":success?"Kilometre güncellendi":"Bilgi"}</strong><span>{message}</span>{success?<span><strong>{plate}</strong> · Yeni Güncel KM: <strong>{fmt(current)} KM</strong></span>:null}</div>:null}
    {confirm?<div className="qr-confirm" role="alertdialog" aria-modal="true"><div className="qr-confirm-box"><strong>Yüksek KM artışı</strong><p>{confirm.message}</p><p className="qr-confirm-delta">+{fmt(confirm.difference)} KM</p><div className="qr-confirm-actions"><button type="button" onClick={()=>setConfirm(null)} className="qr-cancel" disabled={busy}>Vazgeç</button><button type="button" onClick={()=>void submit(true)} className="qr-submit" disabled={busy}>{busy?"Kaydediliyor…":"Evet, Kaydet"}</button></div></div></div>:null}
    {threshold>0?<div className="qr-security-note">Olağandışı yüksek kilometre artışlarında kayıt öncesi ek onay istenir.</div>:null}
  </>
}
