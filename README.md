# İdari İşler Portalı V2.15.0 — MySQL — Hosting Ready

Bu paket, **V2.14.1-MYSQL** sürümü üzerine hazırlanmıştır. V2.15.0'ın ana amacı Araç QR / KM Güncelleme sisteminden ikame araçları tamamen ayırmak ve portalı production/hosting açısından yeniden tarayıp tespit edilen kritik tutarsızlıkları düzeltmektir.

## Yükseltme

1. Canlı MySQL veritabanınızın ve `storage/uploads` / `storage/branding` dosyalarının yedeğini alın.
2. **MySQL veritabanını veya Railway volume'ünü silmeyin.**
3. Bu paketin kodunu dağıtın ve mevcut MySQL environment değerlerini koruyun.
4. Node.js **24** kullanın (`.nvmrc` ve `package.json` bunu belirtir).
5. Bağımlılıkları kurun: `npm ci`
6. Statik production kontrolü: `npm run preflight:static`
7. Production build: `npm run build`
8. Başlatın: `npm start`

`npm start`, Next.js başlamadan önce `scripts/mysql-init.cjs` çalıştırır. V2.15.0 şema yükseltmesi mevcut verileri silmeden uygulanır. Daha önce yanlışlıkla ikame araç için oluşturulmuş QR kayıtları silinmez; **pasif hale getirilir ve tekrar etkinleştirilmeleri engellenir.**

## Production environment

`.env.example` örnektir; gerçek `.env*` dosyaları kaynak paketine/repoya eklenmemelidir.

- MySQL: `MYSQL_URL` **veya** `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`
- Kalıcı kullanıcı dosyaları: `PORTAL_DATA_DIR` ve gerekirse `PORTAL_UPLOAD_DIR`
- HTTPS production: `PORTAL_COOKIE_SECURE=true`
- QR için canlı adres: `PORTAL_PUBLIC_URL=https://...`

Railway benzeri ephemeral filesystem kullanan hostinglerde `PORTAL_DATA_DIR` mutlaka kalıcı bir volume yoluna bağlanmalıdır. MySQL verileri veritabanında, yüklenen ekler/branding dosyaları ise bu kalıcı dosya alanında tutulur.

## V2.15.0 ana değişiklikleri

- İkame araçlar QR/KM listesinden, tekli QR'dan, toplu QR'dan, yazdırmadan ve arama/seçim akışlarından çıkarıldı.
- Public `/q/{token}` ve public KM POST katmanında da ikame kontrolü eklendi; eski ikame QR token'ları kullanılamaz.
- Veritabanına ikame QR oluşturmayı/yeniden etkinleştirmeyi engelleyen trigger eklendi.
- Geçmişte oluşturulmuş aktif ikame QR kayıtları migration sırasında pasif hale getirilir; ikame servis/geçmiş verileri silinmez.
- İkame aracın merkezi durumu `ACTIVE` yerine `REPLACEMENT` olarak tutarlı hale getirildi; personelde kullanım sırasında `TEMP_IN_USE`, iade sonrası tekrar `REPLACEMENT` olur.
- İkame araç Araç Kullanım/Teslim ekranında kullanılabilir; ancak bu kullanım ekranındaki opsiyonel KM, ikame aracın merkezi KM kaynağını değiştirmez.
- `/arac-zimmetleri/gecmis` eksik route'u eklendi.
- MySQL restore ve SQLite→MySQL migration sürüm işaretleri V2.15.0 ile senkronize edildi.
- MySQL trigger üretiminde SQLite `||` birleştirme kalıntısı kaldırıldı ve ikame durum trigger'ları düzeltildi.
- Dosya yükleme akışı transaction/cleanup ile güçlendirildi; başarısız fiziksel yazım/veritabanı kaydında boş attachment bırakılmaz.
- İlk kullanıcı kurulumundaki eşzamanlı istek yarışı transaction ile kapatıldı.
- `.gitignore` tüm gerçek `.env*`, yerel DB ve build/runtime dosyalarını daha sıkı hariç tutar.
- `npm run preflight:static` eklendi.

Detaylı sonuçlar için `V2.15.0_HOSTING_READY_RAPORU.md` dosyasına bakın.
