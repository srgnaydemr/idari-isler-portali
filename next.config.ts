import type { NextConfig } from "next";
import path from "node:path";
import {createRequire} from "node:module";
const runtimeRequire=createRequire(path.join(process.cwd(),"package.json"));
const mysqlRuntimeFiles=runtimeRequire("./database/standalone-files.cjs").mysqlRuntimeFiles(process.cwd()) as string[];

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["mysql2"],
  outputFileTracingIncludes: {"/*": ["./database/**/*", ...mysqlRuntimeFiles]},
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: { ignoreBuildErrors: false },
  experimental: {
    useTypeScriptCli: false,
    webpackBuildWorker: false,
    workerThreads: true,
    cpus: 1,
    serverActions: { bodySizeLimit: "30mb" },
    proxyClientMaxBodySize: "30mb",
  },
  async redirects() {
    return [
      {source:"/dashboard",destination:"/ana-panel",permanent:true},
      {source:"/vehicles/new",destination:"/araclar/yeni",permanent:true},
      {source:"/vehicles/import",destination:"/araclar/excel-yukle",permanent:true},
      {source:"/vehicles/compliance-import",destination:"/araclar/sure-takibi-excel",permanent:true},
      {source:"/vehicles/:id",destination:"/araclar/:id",permanent:true},
      {source:"/vehicles",destination:"/araclar",permanent:true},
      {source:"/accidents/damage/:id",destination:"/kaza-hasar/hasar/:id",permanent:true},
      {source:"/accidents/:id",destination:"/kaza-hasar/:id",permanent:true},
      {source:"/accidents",destination:"/kaza-hasar",permanent:true},
      {source:"/maintenance",destination:"/servis-ikame",permanent:true},
      {source:"/service",destination:"/servis-ikame",permanent:true},
      {source:"/tires",destination:"/lastik-yonetimi",permanent:true},
      {source:"/traffic-fines",destination:"/trafik-cezalari",permanent:true},
      {source:"/personnel-assets/equipment/:id",destination:"/personel-zimmetleri/demirbas/:id",permanent:true},
      {source:"/personnel-assets/personnel/:id",destination:"/personel-zimmetleri/personel/:id",permanent:true},
      {source:"/personnel-assets",destination:"/personel-zimmetleri",permanent:true},
      {source:"/personnel/:id",destination:"/personel-yonetimi/:id",permanent:true},
      {source:"/personnel",destination:"/personel-yonetimi",permanent:true},
      {source:"/vehicle-usage",destination:"/arac-kullanim-teslim",permanent:true},
      {source:"/vehicle-qr/print",destination:"/arac-qr-km-guncelleme/yazdir",permanent:true},
      {source:"/vehicle-qr/:vehicleId",destination:"/arac-qr-km-guncelleme/:vehicleId",permanent:true},
      {source:"/vehicle-qr",destination:"/arac-qr-km-guncelleme",permanent:true},
      {source:"/qr-km",destination:"/arac-qr-km-guncelleme",permanent:true},
      {source:"/assignments/:id",destination:"/arac-zimmetleri/:id",permanent:true},
      {source:"/assignments",destination:"/arac-zimmetleri",permanent:true},
      {source:"/tasks",destination:"/gorevler",permanent:true},
      {source:"/calendar",destination:"/takvim",permanent:true},
      {source:"/reports",destination:"/raporlar",permanent:true},
      {source:"/audit-log",destination:"/islem-gecmisi",permanent:true},
      {source:"/users",destination:"/kullanicilar",permanent:true},
      {source:"/notifications",destination:"/bildirimler",permanent:true},
      {source:"/attention",destination:"/dikkat-gerektirenler",permanent:true},
      {source:"/search",destination:"/arama",permanent:true},
      {source:"/profile",destination:"/profil",permanent:true},
      {source:"/equipment-types",destination:"/envanter-turleri",permanent:true},
      {source:"/replacement-vehicles",destination:"/araclar?tur=ikame",permanent:true},
      {source:"/ikame-araclar",destination:"/araclar?tur=ikame",permanent:true},
      {source:"/inventory",destination:"/personel-zimmetleri/envanter",permanent:true},
      {source:"/damage",destination:"/kaza-hasar",permanent:true}
    ];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      ],
    }];
  },
};

export default nextConfig;
