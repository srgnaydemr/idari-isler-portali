import { redirect } from "next/navigation";
import { hasUsers } from "@/lib/local/auth";
import { getDatabase } from "@/lib/local/database";
import { PortalFooter } from "@/components/portal-footer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Setup({searchParams}:{searchParams:Promise<{error?:string}>}) {
  if (await hasUsers()) redirect("/login");
  const sp = await searchParams;
  const settings = getDatabase().prepare("SELECT setting_key,setting_value FROM system_settings WHERE setting_key IN ('portal_name','company_name','portal_version')").all() as any[];
  const st = Object.fromEntries(settings.map((x:any)=>[x.setting_key,x.setting_value]));

  return (
    <main className="login-shell login-premium">
      <section className="login-visual">
        <div className="login-visual-glow" />
        <div className="login-company-mark"><img src="/nil-global-logo.png" alt="Nil Global Altın A.Ş." /></div>
        <div className="login-copy">
          <span className="login-eyebrow">İLK KURULUM</span>
          <h1>İlk kullanıcı hesabını oluşturun.</h1>
          <p>Portalın ilk kullanıcı hesabını oluşturun. Bu ekran yalnızca sistemde henüz kullanıcı bulunmadığında görüntülenir.</p>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-panel-inner"><form action="/api/setup" method="post" className="login-card login-card-premium">
          <div className="login-card-logo"><img src="/nil-monogram.png" alt="Nil Global" /></div>
          <div className="login-card-head"><h2>İlk Kullanıcı</h2><p>Hesap oluşturulduktan sonra giriş ekranına yönlendirileceksiniz.</p></div>
          <div className="login-form">
            {sp.error ? <div className="error-box" role="alert">{sp.error}</div> : null}
            <div className="form-grid">
              <div className="field"><label>Ad</label><input name="first_name" className="input" /></div>
              <div className="field"><label>Soyad</label><input name="last_name" className="input" /></div>
            </div>
            <div className="field"><label>Kullanıcı Adı *</label><input name="username" className="input" required /></div>
            <div className="field"><label>E-posta *</label><input name="email" type="email" className="input" required /></div>
            <div className="field"><label>Şifre *</label><input name="password" type="password" minLength={8} className="input" required /></div>
            <button type="submit" className="btn btn-primary login-submit">Kullanıcıyı Oluştur</button>
          </div>
        </form><PortalFooter compact portalName={st.portal_name || "İdari İşler Portalı"} companyName={st.company_name || "Nil Global Altın Ticaret A.Ş."} version={st.portal_version || "2.15.0"}/></div>
      </section>
    </main>
  );
}
