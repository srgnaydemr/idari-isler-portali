"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import { LayoutDashboard, Car, TriangleAlert, CircleGauge, ListTodo, CalendarDays, FileBarChart2, ScrollText, Laptop2, Users, KeyRound, Wrench, UserCog, QrCode } from "lucide-react";
const icons:any={dashboard:LayoutDashboard,vehicles:Car,maintenance:Wrench,accidents:TriangleAlert,tires:CircleGauge,personnel:Users,personnel_assets:Laptop2,vehicle_usage:KeyRound,tasks:ListTodo,calendar:CalendarDays,reports:FileBarChart2,audit:ScrollText,users:UserCog,vehicle_qr:QrCode};
const section:any={dashboard:"GENEL",vehicles:"ARAÇ YÖNETİMİ",vehicle_usage:"ARAÇ YÖNETİMİ",vehicle_qr:"ARAÇ YÖNETİMİ",maintenance:"ARAÇ YÖNETİMİ",accidents:"ARAÇ YÖNETİMİ",tires:"ARAÇ YÖNETİMİ",personnel:"PERSONEL VE ENVANTER",personnel_assets:"PERSONEL VE ENVANTER",tasks:"İŞ YÖNETİMİ",calendar:"İŞ YÖNETİMİ",reports:"RAPORLAMA",audit:"SİSTEM",users:"SİSTEM"};
export function Sidebar({portalName="İDARİ İŞLER",companyName="Operasyon Yönetim Portalı",items=[]}:{portalName?:string;companyName?:string;items?:any[]}){
 const pathname=usePathname();const groups=new Map<string,any[]>();
 for(const item of items){const g=section[item.menu_key]||"DİĞER";if(!groups.has(g))groups.set(g,[]);groups.get(g)!.push(item)}
 return <aside id="portal-navigation" className="sidebar"><div className="brand"><img src="/api/branding/logo?variant=mark" onError={(e:any)=>{e.currentTarget.src='/nil-monogram.png'}} alt="Şirket Logosu" className="sidebar-logo"/><div className="brand-copy"><div className="brand-title">{portalName}</div><div className="brand-sub">{companyName}</div></div></div>{[...groups.entries()].map(([g,arr])=><div className="nav-section" key={g}><div className="nav-label">{g}</div>{arr.map((item:any)=>{const Icon=icons[item.menu_key]||LayoutDashboard;const active=pathname===item.href||pathname.startsWith(item.href+"/");return <Link key={item.menu_key} href={item.href} className={`nav-link ${active?"active":""}`}><Icon size={17}/><span>{item.label}</span></Link>})}</div>)}</aside>
}
