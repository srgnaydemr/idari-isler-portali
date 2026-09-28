"use client";
import { useFormStatus } from "react-dom";
export function SubmitButton({children="Kaydet",className="btn btn-primary"}:{children?:React.ReactNode,className?:string}){const{pending}=useFormStatus();return <button type="submit" className={className} disabled={pending}>{pending?"Kaydediliyor...":children}</button>}
