"use client";
import {MobileMenu} from "./mobile-menu";
import Link from "next/link";
import { Bell, Search, Plus, LogOut, UserRound } from "lucide-react";
import {useEffect,useState} from "react";
export function Topbar({userName="Kullanıcı",unreadNotifications=0}:{userName?:string;unreadNotifications?:number}){
 const initials=userName.split(" ").filter(Boolean).map(x=>x[0]).join("").slice(0,2).toUpperCase();
 const [unread,setUnread]=useState(unreadNotifications);
 useEffect(()=>{setUnread(unreadNotifications)},[unreadNotifications]);
 useEffect(()=>{let active=true;const refresh=async()=>{try{const r=await fetch("/api/notifications/unread",{cache:"no-store"});if(r.ok){const j=await r.json();if(active)setUnread(Number(j?.unread||0))}}catch{}};const timer=window.setInterval(refresh,30000);window.addEventListener("focus",refresh);return()=>{active=false;window.clearInterval(timer);window.removeEventListener("focus",refresh)}},[]);
 return <header className="topbar"><MobileMenu/><form className="searchbox" action="/arama" method="get"><Search size={17}/><input name="q" aria-label="Global arama" placeholder="Plaka, personel, seri no, görev ara..."/></form><div className="top-actions"><Link className="icon-btn" title="Araç Ekle" href="/araclar/yeni"><Plus size={18}/></Link><Link className="icon-btn notification-button" title="Bildirimler" href="/bildirimler"><Bell size={18}/>{unread>0?<span className="notification-badge">{unread>99?"99+":unread}</span>:null}</Link><details className="profile-menu"><summary className="profile-summary"><div className="avatar">{initials||"K"}</div><div className="profile-chip"><span style={{fontSize:13,fontWeight:800}}>{userName}</span></div></summary><div className="profile-dropdown"><Link href="/profil"><UserRound size={16}/>Profil</Link><form action="/api/logout" method="post"><button type="submit"><LogOut size={16}/>Çıkış</button></form></div></details></div></header>
}
