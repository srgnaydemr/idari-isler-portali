import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/local/database";
import { themeCssVars } from "@/lib/theme";
import { DailyAutoRefresh } from "@/components/daily-auto-refresh";

export const dynamic="force-dynamic";
export default async function PortalLayout({children}:{children:React.ReactNode}){
  const {profile,user,configured,db:client}=await requireUser();
  const name=profile?`${profile.first_name??""} ${profile.last_name??""}`.trim():(user?.email??"Kurulum Modu");
  await client.rpc("refresh_reminder_notifications");
  const db=getDatabase();
  const unreadNotifications=Number((db.prepare("SELECT count(*) c FROM notifications WHERE user_id=? AND is_read=0").get(user.id) as any)?.c||0);
  const rows=db.prepare("SELECT setting_key,setting_value FROM system_settings WHERE setting_key IN ('portal_name','company_name','portal_version')").all() as any[];
  const st=Object.fromEntries(rows.map((x:any)=>[x.setting_key,x.setting_value]));
  // node:sqlite satırları null-prototype obje olarak döner.
  // Client Component olan Sidebar'a yalnızca düz/serileştirilebilir objeler gönderiyoruz.
  const rawMenu=db.prepare("SELECT menu_key,label,href FROM menu_settings WHERE is_visible=1 ORDER BY sort_order,label").all() as any[];
  const menu=rawMenu.map((row:any)=>({
    menu_key:String(row.menu_key??""),
    label:String(row.label??""),
    href:String(row.href??"/ana-panel"),
  }));
  return <div style={themeCssVars()}><DailyAutoRefresh/><AppShell userName={configured?(name||"Kullanıcı"):"Kurulum Modu"} portalName={st.portal_name||"İDARİ İŞLER"} companyName={st.company_name||"Operasyon Yönetim Portalı"} portalVersion={st.portal_version||"2.15.0"} menuItems={menu} unreadNotifications={unreadNotifications}>{children}</AppShell></div>
}
