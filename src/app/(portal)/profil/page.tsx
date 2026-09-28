import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { getDatabase } from "@/lib/local/database";
import { setUserPassword } from "@/lib/local/auth";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

export default async function Profile({ searchParams }: { searchParams: Promise<{ saved?: string; password?: string; error?: string }> }) {
  const { user } = await requireUser();
  const sp = await searchParams;
  const db = getDatabase();
  const row = db.prepare("SELECT first_name,last_name,username,email,last_login_at,created_at FROM users WHERE id=?").get(user.id) as any;

  async function saveProfile(fd: FormData) {
    "use server";
    const { user } = await requireUser();
    const first = String(fd.get("first_name") || "").trim();
    const last = String(fd.get("last_name") || "").trim();
    const n = new Date().toISOString();
    getDatabase().prepare("UPDATE users SET first_name=?,last_name=?,updated_at=? WHERE id=?").run(first || null, last || null, n, user.id);
    revalidatePath("/profil");
    revalidatePath("/", "layout");
    redirect("/profil?saved=1");
  }

  async function changePassword(fd: FormData) {
    "use server";
    const { user } = await requireUser();
    const a = String(fd.get("new_password") || "");
    const b = String(fd.get("new_password_again") || "");
    if (a.length < 8) redirect("/profil?error=password_short");
    if (a !== b) redirect("/profil?error=password_mismatch");
    await setUserPassword(user.id, a);
    redirect("/login?password=changed");
  }

  const err = sp.error === "password_short" ? "Yeni şifre en az 8 karakter olmalıdır." : sp.error === "password_mismatch" ? "Yeni şifreler birbiriyle eşleşmiyor." : null;
  return <>
    <div className="page-head"><div><h1 className="page-title">Profil</h1><div className="page-sub">Hesap, oturum ve kişisel bilgileriniz</div></div></div>
    {sp.saved ? <div className="success-box">Profil bilgileri güncellendi.</div> : null}
    {err ? <div className="error-box">{err}</div> : null}
    <div className="two-col section">
      <form action={saveProfile} className="card">
        <div className="section-head"><div className="section-title">Profil Bilgileri</div></div>
        <div className="section-body"><div className="form-grid">
          <div className="field"><label>Ad</label><input className="input" name="first_name" defaultValue={row.first_name || ""}/></div>
          <div className="field"><label>Soyad</label><input className="input" name="last_name" defaultValue={row.last_name || ""}/></div>
          <div className="field"><label>Kullanıcı Adı</label><input className="input" value={row.username || ""} readOnly/></div>
          <div className="field"><label>E-posta</label><input className="input" value={row.email || ""} readOnly/></div>
          
          <div className="field"><label>Son Giriş</label><input className="input" value={formatDateTime(row.last_login_at)} readOnly/></div>
        </div><div className="form-actions"><SubmitButton>Profili Kaydet</SubmitButton></div></div>
      </form>
      <form action={changePassword} className="card">
        <div className="section-head"><div><div className="section-title">Şifre Değiştir</div><div className="page-sub">Şifre değiştiğinde mevcut oturumlar kapatılır.</div></div></div>
        <div className="section-body"><div className="field"><label>Yeni Şifre *</label><input className="input" type="password" name="new_password" minLength={8} required autoComplete="new-password"/></div><div className="field" style={{marginTop:12}}><label>Yeni Şifre Tekrar *</label><input className="input" type="password" name="new_password_again" minLength={8} required autoComplete="new-password"/></div><div className="form-actions"><SubmitButton>Şifreyi Değiştir</SubmitButton></div></div>
      </form>
    </div>
    <section className="card section"><div className="section-body"><div className="detail-grid"><div><span>Hesap Oluşturma</span><strong>{formatDateTime(row.created_at)}</strong></div><div><span>Son Giriş</span><strong>{formatDateTime(row.last_login_at)}</strong></div></div></div></section>
  </>;
}
