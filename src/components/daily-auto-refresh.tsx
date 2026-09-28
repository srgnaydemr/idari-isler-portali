"use client";
import {useEffect,useRef} from "react";
import {useRouter} from "next/navigation";

function istanbulDate(){
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}

/** Tarih bazlı portal hesaplarını gece değişiminde kullanıcı müdahalesi olmadan yeniler. */
export function DailyAutoRefresh(){
  const router=useRouter(),day=useRef(istanbulDate());
  useEffect(()=>{
    const check=()=>{const next=istanbulDate();if(next!==day.current){day.current=next;router.refresh();}};
    const timer=window.setInterval(check,60_000);
    document.addEventListener("visibilitychange",check);
    window.addEventListener("focus",check);
    return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",check);window.removeEventListener("focus",check);};
  },[router]);
  return null;
}
