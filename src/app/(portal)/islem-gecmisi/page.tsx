import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { actionLabel, entityLabel, moduleLabel } from "@/lib/labels";

const PAGE_SIZE = 50;
const REMOVED_MODULES = ["Stok", "Stok Sayımı", "inventory_items", "inventory_transactions", "departments", "deliveries"];

function pageHref(page: number, q: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const str = params.toString();
  return str ? `/islem-gecmisi?${str}` : "/islem-gecmisi";
}

export default async function Audit({ searchParams }: { searchParams: Promise<{page?:string;q?:string}> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page || 1) || 1);
  const q = (sp.q || "").trim();
  const { db } = await requireUser();
  let rows: any[] = [];
  let total = 0;

  if (db) {
    let query = db.from("audit_logs")
      .select("id,created_at,user_name_snapshot,module,action,entity_type,entity_reference,description,request_id", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    for (const module of REMOVED_MODULES) query = query.neq("module", module);
    if (q.length >= 2) {
      const like = `%${q.replace(/,/g, " ")}%`;
      query = query.or(`user_name_snapshot.ilike.${like},module.ilike.${like},action.ilike.${like},entity_reference.ilike.${like},description.ilike.${like}`);
    }

    const result = await query;
    rows = result.data ?? [];
    total = result.count ?? 0;
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return <>
    <div className="page-head"><div><h1 className="page-title">İşlem Geçmişi</h1><div className="page-sub">Salt okunur sistem işlem kayıtları • {total} kayıt</div></div></div>
    <div className="notice" style={{ marginBottom: 14 }}>Bu ekran yalnızca görüntüleme içindir. Veritabanı güvenlik politikaları işlem geçmişinin değiştirilmesini engeller.</div>
    <form method="get" className="filters"><input className="input filter-search" name="q" defaultValue={q} placeholder="Kullanıcı, modül, işlem veya kayıt ara..." /><button type="submit" className="btn btn-secondary">Ara</button>{q ? <Link href="/islem-gecmisi" className="btn btn-secondary">Aramayı Temizle</Link> : null}</form>
    <section className="card table-wrap"><table className="table"><thead><tr><th>Tarih / Saat</th><th>Kullanıcı</th><th>Modül</th><th>İşlem</th><th>İlgili Kayıt</th><th>Açıklama</th><th>İşlem Referansı</th></tr></thead><tbody>{rows.map((r: any) => <tr key={r.id}><td>{formatDateTime(r.created_at)}</td><td>{r.user_name_snapshot || "Sistem"}</td><td>{moduleLabel(r.module)}</td><td><strong>{actionLabel(r.action)}</strong></td><td>{r.entity_reference || entityLabel(r.entity_type) || "—"}</td><td>{r.description || "—"}</td><td><code style={{ fontSize: 11 }}>{r.request_id}</code></td></tr>)}</tbody></table>{!rows.length ? <div className="empty">İşlem geçmişinde eşleşen kayıt bulunmuyor.</div> : null}</section>
    {total > PAGE_SIZE ? <div className="pagination"><div className="page-sub">Sayfa {page} / {pageCount}</div><div className="pagination-actions">{page > 1 ? <Link className="btn btn-secondary" href={pageHref(page - 1, q)}>← Önceki</Link> : null}{page < pageCount ? <Link className="btn btn-secondary" href={pageHref(page + 1, q)}>Sonraki →</Link> : null}</div></div> : null}
  </>;
}
