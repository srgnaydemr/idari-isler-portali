"use client";
import {useMemo,useState} from "react";

type VehicleOption={id:string;plate:string;brand?:string|null;model?:string|null;tire_storage_dealer?:string|null;current_odometer:number};

export function TireVehicleFields({vehicles}:{vehicles:VehicleOption[]}){
  const [vehicleId,setVehicleId]=useState("");
  const selected=useMemo(()=>vehicles.find(v=>v.id===vehicleId)||null,[vehicles,vehicleId]);
  return <>
    <div className="field"><label>Araç *</label><select name="vehicle_id" className="select" required value={vehicleId} onChange={e=>setVehicleId(e.target.value)}><option value="">Seçiniz</option>{vehicles.map(v=><option value={v.id} key={v.id}>{v.plate} — {[v.brand,v.model].filter(Boolean).join(" ")}{v.tire_storage_dealer?` — ${v.tire_storage_dealer}`:""}</option>)}</select></div>
    <div className="field"><label>Araç Markası</label><input className="input" value={selected?.brand||""} readOnly placeholder="Plaka seçildiğinde otomatik gelir"/></div>
    <div className="field"><label>Araç Modeli</label><input className="input" value={selected?.model||""} readOnly placeholder="Plaka seçildiğinde otomatik gelir"/></div>
    <div className="field"><label>İşlem KM *</label><input className="input" name="odometer" type="number" min={selected?.current_odometer??0} placeholder={selected?`En az ${selected.current_odometer} KM`:"Önce araç seçin"} required/><small>{selected?`Araç güncel KM: ${selected.current_odometer.toLocaleString("tr-TR")} KM`:"Girilen KM aracın güncel kilometresinden düşük olamaz."}</small></div>
  </>;
}
