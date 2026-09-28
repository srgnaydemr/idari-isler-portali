import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/local/database";
import { formatDateTime } from "@/lib/format";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; saved?: string; error?: string; edit?: string; password?: string }> }) {
  const { user: currentUser } = await requireUser();
  const sp = await searchParams;
  const db = getDatabase();
  const q = String(sp.q || "").trim();
  const filter = ["active", "passive", "all"].includes(String(sp.filter || "")) ? String(sp.filter) : "active";
  const like = `%${q}%`;
  const where = filter === "active" ? "u.is_active=1" : filter === "passive" ? "u.is_active=0" : "1=1";
  const users = db.prepare(`SELECT u.*,
    (SELECT count(*) FROM audit_logs a WHERE a.user_id=u.id) audit_count
    FROM users u
    WHERE ${where} AND (?='' OR COALESCE(u.first_name,'')||' '||COALESCE(u.last_name,'') LIKE ? COLLATE NOCASE OR u.username LIKE ? COLLATE NOCASE OR u.email LIKE ? COLLATE NOCASE)
    ORDER BY u.is_active DESC, COALESCE(u.first_name,''), COALESCE(u.last_name,''), u.username`).all(q, like, like, like) as any[];
  const editUser = sp.edit ? db.prepare("SELECT * FROM users WHERE id=?").get(sp.edit) as any : null;
  const passwordUser = sp.password ? db.prepare("SELECT id,first_name,last_name,username,email FROM users WHERE id=?").get(sp.password) as any : null;
  const savedMessage = sp.saved === "created" ? "Yeni kullanıcı oluşturuldu." : sp.saved === "updated" ? "Kullanıcı bilgileri güncellendi." : sp.saved === "activated" ? "Kullanıcı aktifleştirildi." : sp.saved === "deactivated" ? "Kullanıcı pasife alındı. Geçmiş işlem kayıtları korunuyor." : sp.saved === "password" ? "Kullanıcı şifresi değiştirildi ve açık oturumları kapatıldı." : null;

  return <>
    <div className="page-head">
      <div><h1 className="page-title">Kullanıcılar</h1><div className="page-sub">Portala giriş yapabilecek kullanıcı hesaplarını oluşturun, düzenleyin ve güvenli şekilde yönetin.</div></div>
    </div>
    {savedMessage ? <div className="success-box">{savedMessage}</div> : null}
    {sp.error ? <div className="error-box">{sp.error}</div> : null}

    <div className="two-col section">
      <form action="/api/users" method="post" className="card">
        <input type="hidden" name="operation" value="create"/>
        <input type="hidden" name="return_to" value="/kullanicilar"/>
        <div className="section-head"><div><div className="section-title">Yeni Kullanıcı</div><div className="page-sub">Yeni hesap oluşturulduğunda kullanıcı, aktif durumdaysa giriş yapabilir.</div></div></div>
        <div className="section-body"><div className="form-grid">
          <div className="field"><label>Ad *</label><input className="input" name="first_name" required autoComplete="given-name"/></div>
          <div className="field"><label>Soyad *</label><input className="input" name="last_name" required autoComplete="family-name"/></div>
          <div className="field"><label>Kullanıcı Adı *</label><input className="input" name="username" required autoComplete="off"/></div>
          <div className="field"><label>E-posta *</label><input className="input" name="email" type="email" required autoComplete="off"/></div>
          <div className="field"><label>Şifre *</label><input className="input" name="password" type="password" minLength={8} required autoComplete="new-password"/><small>En az 8 karakter.</small></div>
          <div className="field"><label>Şifre Tekrar *</label><input className="input" name="password_again" type="password" minLength={8} required autoComplete="new-password"/></div>
          <div className="field"><label>Kullanıcı Durumu</label><select className="select" name="is_active" defaultValue="1"><option value="1">Aktif</option><option value="0">Pasif</option></select></div>
        </div><div className="form-actions"><SubmitButton>Kullanıcı Oluştur</SubmitButton></div></div>
      </form>

      <section className="card"><div className="section-head"><div><div className="section-title">Kullanıcı Yönetimi Kuralı</div><div className="page-sub">Hesap pasife alınsa bile eski kayıtlar korunur.</div></div></div><div className="section-body"><div className="notice"><strong>Geçmiş işlemler kullanıcı hesabından bağımsız korunur.</strong> Bir hesabı pasife almak; servis, zimmet, hasar veya işlem geçmişindeki kullanıcı bilgisini silmez. Kendi hesabınızı veya sistemdeki son aktif hesabı pasife alamazsınız.</div></div></section>
    </div>

    {editUser ? <form action="/api/users" method="post" className="card section">
      <input type="hidden" name="operation" value="update"/><input type="hidden" name="user_id" value={editUser.id}/><input type="hidden" name="return_to" value="/kullanicilar"/>
      <div className="section-head"><div><div className="section-title">Kullanıcıyı Düzenle</div><div className="page-sub">{editUser.username} hesabının temel bilgilerini değiştirin.</div></div><Link className="btn btn-secondary" href="/kullanicilar">Kapat</Link></div>
      <div className="section-body"><div className="form-grid">
        <div className="field"><label>Ad *</label><input className="input" name="first_name" defaultValue={editUser.first_name || ""} required/></div>
        <div className="field"><label>Soyad *</label><input className="input" name="last_name" defaultValue={editUser.last_name || ""} required/></div>
        <div className="field"><label>Kullanıcı Adı *</label><input className="input" name="username" defaultValue={editUser.username || ""} required/></div>
        <div className="field"><label>E-posta *</label><input className="input" name="email" type="email" defaultValue={editUser.email || ""} required/></div>
        <div className="field"><label>Durum</label><select className="select" name="is_active" defaultValue={editUser.is_active ? "1" : "0"}><option value="1">Aktif</option><option value="0">Pasif</option></select></div>
      </div><div className="form-actions"><SubmitButton>Değişiklikleri Kaydet</SubmitButton></div></div>
    </form> : null}

    {passwordUser ? <form action="/api/users" method="post" className="card section">
      <input type="hidden" name="operation" value="password"/><input type="hidden" name="user_id" value={passwordUser.id}/><input type="hidden" name="return_to" value="/kullanicilar"/>
      <div className="section-head"><div><div className="section-title">Şifre Değiştir</div><div className="page-sub">{[passwordUser.first_name, passwordUser.last_name].filter(Boolean).join(" ") || passwordUser.username} için yeni şifre belirleyin. Açık oturumları kapatılır.</div></div><Link className="btn btn-secondary" href="/kullanicilar">Kapat</Link></div>
      <div className="section-body"><div className="form-grid"><div className="field"><label>Yeni Şifre *</label><input className="input" type="password" name="password" minLength={8} required autoComplete="new-password"/></div><div className="field"><label>Yeni Şifre Tekrar *</label><input className="input" type="password" name="password_again" minLength={8} required autoComplete="new-password"/></div></div><div className="form-actions"><SubmitButton>Şifreyi Değiştir</SubmitButton></div></div>
    </form> : null}

    <form className="filters section" method="get"><input className="input filter-search" name="q" defaultValue={q} placeholder="Ad soyad, kullanıcı adı veya e-posta ara…"/><select className="select" name="filter" defaultValue={filter}><option value="active">Aktif Kullanıcılar</option><option value="passive">Pasif Kullanıcılar</option><option value="all">Tümü</option></select><button className="btn btn-primary">Filtrele</button>{q || filter !== "active" ? <Link className="btn btn-secondary" href="/kullanicilar">Temizle</Link> : null}</form>

    <section className="card section table-wrap"><div className="section-head"><div><div className="section-title">Kullanıcı Listesi</div><div className="page-sub">Son giriş tarihi ve hesap durumu tek ekranda görüntülenir.</div></div></div>
      <table className="table"><thead><tr><th>Ad Soyad</th><th>Kullanıcı Adı</th><th>E-posta</th><th>Durum</th><th>Son Giriş</th><th>İşlem Geçmişi</th><th>İşlemler</th></tr></thead><tbody>{users.map(u => <tr key={u.id}><td><strong>{[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}</strong>{u.id === currentUser.id ? <div className="page-sub">Mevcut oturum</div> : null}</td><td>{u.username}</td><td>{u.email}</td><td><span className={`pill ${u.is_active ? "green" : "gray"}`}>{u.is_active ? "Aktif" : "Pasif"}</span></td><td>{u.last_login_at ? formatDateTime(u.last_login_at) : "Henüz giriş yapmadı"}</td><td>{Number(u.audit_count || 0)} kayıt</td><td><div className="row-actions"><Link className="btn btn-secondary" href={`/kullanicilar?edit=${encodeURIComponent(u.id)}`}>Düzenle</Link><Link className="btn btn-secondary" href={`/kullanicilar?password=${encodeURIComponent(u.id)}`}>Şifre</Link>{u.id !== currentUser.id ? <form action="/api/users" method="post"><input type="hidden" name="operation" value="toggle"/><input type="hidden" name="user_id" value={u.id}/><input type="hidden" name="return_to" value="/kullanicilar"/><ConfirmSubmitButton message={u.is_active ? `${u.username} kullanıcısını pasife almak istediğinize emin misiniz? Kullanıcı artık giriş yapamayacak, geçmiş işlem kayıtları korunacaktır.` : `${u.username} kullanıcısını tekrar aktifleştirmek istediğinize emin misiniz?`}>{u.is_active ? "Pasife Al" : "Aktifleştir"}</ConfirmSubmitButton></form> : null}</div></td></tr>)}</tbody></table>
      {!users.length ? <div className="empty"><strong>Kullanıcı bulunamadı.</strong>Seçili filtreye uygun hesap yok.</div> : null}
    </section>
  </>;
}
