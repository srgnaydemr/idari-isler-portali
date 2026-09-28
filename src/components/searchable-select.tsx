"use client";
import {searchMatches} from "@/lib/search";
import {useMemo,useState} from "react";
export type SearchOption={value:string;label:string;searchText?:string};
export function SearchableSelect({name,label,options,required=false,placeholder="Ara...",selectPlaceholder="Seçin"}:{name:string;label:string;options:SearchOption[];required?:boolean;placeholder?:string;selectPlaceholder?:string}){
 const[q,setQ]=useState("");const filtered=useMemo(()=>{const x=q.trim().toLocaleLowerCase("tr-TR");if(!x)return options;return options.filter(o=>searchMatches(o.label+" "+(o.searchText||""),x))},[q,options]);
 return <div className="field"><label>{label}{required?" *":""}</label><input type="search" className="input" value={q} onChange={e=>setQ(e.target.value)} placeholder={placeholder} autoComplete="off"/><select className="select" name={name} required={required} defaultValue="" style={{marginTop:6}}><option value="" disabled={required}>{selectPlaceholder}</option>{filtered.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>{q&&filtered.length===0?<small>Eşleşen kayıt bulunamadı.</small>:null}</div>
}
