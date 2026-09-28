export function PortalFooter({ portalName = "İdari İşler Portalı", companyName = "Şirket", version = "2.11.0", compact = false }: { portalName?: string; companyName?: string; version?: string; compact?: boolean }) {
  const year = new Date().getFullYear();
  return <footer className={`portal-footer ${compact ? "compact" : ""}`}>
    <span className="portal-footer-name">{portalName}</span>
    <span className="portal-footer-separator" aria-hidden="true">·</span>
    <span>© {year} {companyName}. Tüm hakları saklıdır.</span>
    {!compact ? <><span className="portal-footer-separator" aria-hidden="true">·</span><span>Sürüm v{version}</span></> : null}
  </footer>;
}
