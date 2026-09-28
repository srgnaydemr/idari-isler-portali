"use client";
export function PrintButton({label="Yazdır / PDF Olarak Kaydet"}:{label?:string}){return <button type="button" className="btn btn-primary print-hide" onClick={()=>window.print()}>{label}</button>}
