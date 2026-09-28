import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";

export default async function VehicleImport({ searchParams }: { searchParams: Promise<{ result?: string; detail?: string; error?: string }> }) {
  const sp = await searchParams;
  const detail = sp.detail ? decodeURIComponent(sp.detail) : "";
  return <>
    <div className="page-head"><div><Link href="/araclar" style={{ fontSize: 12, color: "var(--muted)" }}>← Araçlar</Link><h1 className="page-title" style={{ marginTop: 6 }}>Excel’den Araç Yükle</h1><div className="page-sub">Önce satırlar doğrulanır. Geçerli satırlar tek transaction içinde kaydedilir; hatalı satırlar satır numarası ve gerçek hata nedeni ile raporlanır.</div></div><a href="/api/vehicle-import" download className="btn btn-secondary">Güncel Excel Şablonunu İndir</a></div>
    {sp.result ? <div className="success-box section">{decodeURIComponent(sp.result)}</div> : null}
    {sp.error ? <div className="error-box section">{decodeURIComponent(sp.error)}</div> : null}
    {detail ? <pre className="code-note section" style={{ whiteSpace: "pre-wrap" }}>{detail}</pre> : null}
    <form action="/api/vehicle-import" method="post" encType="multipart/form-data" className="card section"><div className="section-head"><div><div className="section-title">Excel Dosyası Seç</div><div className="page-sub">Bu ekrandaki “Güncel Excel Şablonunu İndir” butonundan aldığınız .xlsx dosyasını kullanın.</div></div></div><div className="section-body"><div className="field"><label>.xlsx dosyası *</label><input type="file" name="file" className="input" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required/><small>Zorunlu sütunlar: Plaka, Marka, Model, Model Yılı, Araç Tipi, Mülkiyet Tipi, Güncel KM, Araç Durumu ve Lastik Depo Bayisi. Duplicate plaka ve şasi numaraları eklenmez.</small></div><div className="form-actions"><SubmitButton>Excel’den Araçları Yükle</SubmitButton></div></div></form>
  </>;
}
