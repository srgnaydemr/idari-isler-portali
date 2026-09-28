"use client";
import {useMemo,useState} from "react";

type Defaults={
  equipment_type?:string|null;brand?:string|null;model?:string|null;serial_number?:string|null;
  imei?:string|null;imei2?:string|null;asset_tag?:string|null;screen_size?:string|null;
  device_subtype?:string|null;description?:string|null;status?:string|null;
};

function kind(type:string){
  const x=type.toLocaleLowerCase("tr-TR");
  return {
    mobile:x.includes("telefon")||x.includes("tablet"),
    monitor:x.includes("monitör")||x.includes("monitor"),
    computer:x.includes("laptop")||x.includes("bilgisayar")||x.includes("masaüstü")||x.includes("desktop"),
  };
}

export function EquipmentFields({types,defaults={},edit=false,statusLocked=false}:{types:string[];defaults?:Defaults;edit?:boolean;statusLocked?:boolean}){
  const [type,setType]=useState(defaults.equipment_type||"");
  const k=useMemo(()=>kind(type),[type]);
  const status=defaults.status||"AVAILABLE";
  const statusLabel=status==="ASSIGNED"?"Zimmetli":status==="DAMAGED"?"Hasarlı":status==="AVAILABLE"?"Havuzda":status==="SERVICE"?"Serviste":status==="INACTIVE"?"Kullanım Dışı":status==="LOST"?"Kayıp":status;
  return <div className="form-grid">
    <div className="field"><label>Ekipman Türü * <a href="/envanter-turleri" className="link-primary">Türleri Yönet</a></label><select className="select" name="equipment_type" required value={type} onChange={e=>setType(e.target.value)}><option value="" disabled>Seçin</option>{Array.from(new Set([...(defaults.equipment_type?[defaults.equipment_type]:[]),...types])).map(x=><option key={x}>{x}</option>)}</select></div>
    <div className="field"><label>Marka{k.mobile?" *":""}</label><input className="input" name="brand" defaultValue={defaults.brand||""} required={k.mobile}/></div>
    <div className="field"><label>Model</label><input className="input" name="model" defaultValue={defaults.model||""}/></div>
    <div className="field"><label>Seri No{k.mobile?" *":""}</label><input className="input" name="serial_number" defaultValue={defaults.serial_number||""} required={k.mobile}/></div>
    {k.mobile?<><div className="field"><label>IMEI 1</label><input className="input" name="imei" defaultValue={defaults.imei||""}/></div><div className="field"><label>IMEI 2</label><input className="input" name="imei2" defaultValue={defaults.imei2||""}/></div></>:null}
    <div className="field"><label>Demirbaş No</label>{edit?<input className="input" value={defaults.asset_tag||"—"} readOnly/>:<input className="input" value="Otomatik oluşturulacak" readOnly/>}<small>Ekipman türüne göre sistem tarafından benzersiz ve sıralı oluşturulur.</small></div>
    {k.monitor?<div className="field"><label>Ekran Boyutu</label><input className="input" name="screen_size" defaultValue={defaults.screen_size||""} placeholder={'Örn. 27"'} /></div>:null}
    {k.computer?<div className="field"><label>Cihaz Türü</label><input className="input" name="device_subtype" defaultValue={defaults.device_subtype||""} placeholder="Laptop, Masaüstü, Mini PC..."/></div>:null}
    {edit?<div className="field"><label>Durum</label>{statusLocked?<><input className="input" value={statusLabel} readOnly/><input type="hidden" name="status" value={status}/></>:<select className="select" name="status" defaultValue={["AVAILABLE","DAMAGED","SERVICE","INACTIVE"].includes(status)?status:"AVAILABLE"}><option value="AVAILABLE">Havuzda</option><option value="DAMAGED">Hasarlı</option><option value="SERVICE">Serviste</option><option value="INACTIVE">Kullanım Dışı</option></select>}</div>:null}
    <div className="field" style={{gridColumn:"1/-1"}}><label>Açıklama</label><textarea className="textarea" name="description" rows={2} defaultValue={defaults.description||""}/></div>
  </div>;
}
