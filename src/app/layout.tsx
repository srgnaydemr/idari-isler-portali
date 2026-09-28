import type { Metadata } from "next";
import "./globals.css";
import { FormSubmitGuard } from "@/components/form-submit-guard";

export const metadata: Metadata = {
  title: "İdari İşler Portalı",
  description: "İdari İşler operasyon yönetim portalı",
  icons: { icon: "/api/branding/favicon" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        {children}
        <FormSubmitGuard />
      </body>
    </html>
  );
}
