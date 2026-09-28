"use client";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="card" style={{ maxWidth: 700, margin: "40px auto" }}><div className="section-body"><h2>İşlem gerçekleştirilemedi</h2><p style={{ color: "var(--muted)" }}>Teknik ayrıntılar kullanıcıya gösterilmedi. Bilgileri kontrol edip tekrar deneyin.</p><button className="btn btn-primary" onClick={() => reset()}>Tekrar Dene</button></div></div>;
}
