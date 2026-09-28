"use client";
import {useState} from 'react';
export function DamageVehicleFields({vehicles}:{vehicles:{id:string;plate:string;current_odometer:number}[]}) {
 const [id,setId]=useState('');const current=vehicles.find(v=>v.id===id)?.current_odometer??0;
 return <><div className="field"><label>Araç *</label><select name="d_vehicle_id" className="select" value={id} onChange={e=>setId(e.target.value)} required><option value="">Seçiniz</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate}</option>)}</select></div><div className="field"><label>Güncel KM *</label><input key={id} name="odometer" className="input" type="number" min={current} step="1" required onInput={e=>e.currentTarget.setCustomValidity('')} onInvalid={e=>{if(e.currentTarget.validity.rangeUnderflow)e.currentTarget.setCustomValidity('Girilen kilometre aracın mevcut kilometresinden düşük olamaz.');}}/><small>Mevcut KM: {current.toLocaleString('tr-TR')}</small></div></>;
}
