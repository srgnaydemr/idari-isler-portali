import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { PortalFooter } from "./portal-footer";

export function AppShell({children,userName,portalName,companyName,portalVersion="2.11.0",menuItems=[],unreadNotifications=0}:{children:React.ReactNode,userName:string;portalName?:string;companyName?:string;portalVersion?:string;menuItems?:any[];unreadNotifications?:number}){
  // SQLite satırları null-prototype olabilir. Client Component sınırından önce
  // yalnızca düz JSON-benzeri veriler gönderiyoruz.
  const safeMenuItems=(menuItems||[]).map((item:any)=>({
    menu_key:String(item?.menu_key??""),
    label:String(item?.label??""),
    href:String(item?.href??"/ana-panel"),
  }));
  return <div className="app-shell"><Sidebar portalName={portalName} companyName={companyName} items={safeMenuItems}/><main className="main"><Topbar userName={userName} unreadNotifications={unreadNotifications}/><div className="main-body"><div className="content">{children}</div><PortalFooter portalName={portalName} companyName={companyName} version={portalVersion}/></div></main></div>
}
