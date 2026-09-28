import { redirect } from "next/navigation";
import { hasUsers } from "@/lib/local/auth";
import { LoginForm } from "./login-form";
import { getDatabase } from "@/lib/local/database";
import { PortalFooter } from "@/components/portal-footer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LoginPage({searchParams}:{searchParams:Promise<{created?:string;error?:string;password?:string}>}){
  if(!(await hasUsers())) redirect("/setup");
  const sp = await searchParams;
  const settings = getDatabase().prepare("SELECT setting_key,setting_value FROM system_settings WHERE setting_key IN ('portal_name','company_name','portal_version')").all() as any[];
  const st = Object.fromEntries(settings.map((x:any)=>[x.setting_key,x.setting_value]));
  const error = sp.error === "missing" ? "E-posta / kullanıcı adı ve şifre zorunludur." : sp.error === "invalid" ? "Giriş bilgileri hatalı veya kullanıcı aktif değil." : sp.error === "locked" ? "Çok fazla başarısız giriş denemesi yapıldı. 15 dakika sonra tekrar deneyin." : sp.error === "generic" ? "Giriş sırasında bir hata oluştu. Lütfen tekrar deneyin." : undefined;
  return <main className="login-shell login-premium">
    <section className="login-visual">
      <div className="login-visual-glow" />
      <div className="login-company-mark" aria-label="Nil Global Altın A.Ş. logosu"><img src="/nil-global-logo.png" alt="Nil Global Altın A.Ş." /></div>
      <div className="login-copy">
        <span className="login-eyebrow">KURUMSAL OPERASYON YÖNETİMİ</span>
        <h1>İdari süreçlerinizi tek, güvenli ve düzenli bir merkezden yönetin.</h1>
        <p>Araç, bakım, kaza, lastik, zimmet, görev, bildirim ve raporlama süreçleri için kurumsal çalışma alanı.</p>
        <div className="login-feature-row"><span>Güvenli Oturum</span><span>Kayıt Geçmişi</span><span>İstanbul Saat Dilimi</span></div>
      </div>
      <div className="login-foot">{st.company_name || "Nil Global Altın Ticaret A.Ş."} • {st.portal_name || "İdari İşler Portalı"}</div>
    </section>
    <section className="login-panel">
      <div className="login-panel-inner"><div className="login-card login-card-premium">
        <div className="login-card-logo"><img src="/nil-monogram.png" alt="Nil Global" /></div>
        <div className="login-card-head"><h2>Portal Girişi</h2><p>Kurumsal hesabınızla güvenli şekilde giriş yapın.</p></div>
        {sp.created === "1" ? <div className="success-box" style={{marginTop:16}}>Kullanıcı hesabı oluşturuldu. Şimdi giriş yapabilirsiniz.</div> : null}{sp.password === "changed" ? <div className="success-box" style={{marginTop:16}}>Şifreniz değiştirildi. Yeni şifrenizle giriş yapın.</div> : null}
        <LoginForm error={error}/>
        <div className="login-security-note">Yetkisiz erişim girişimleri kayıt altına alınabilir.</div>
      </div><PortalFooter compact portalName={st.portal_name || "İdari İşler Portalı"} companyName={st.company_name || "Nil Global Altın Ticaret A.Ş."} version={st.portal_version || "2.15.0"}/></div>
    </section>
  </main>;
}
