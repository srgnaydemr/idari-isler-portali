const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const staticOnly=process.argv.includes('--static');
let passed=0,failed=0;
function ok(name,cond,detail=''){if(cond){passed++;console.log('PASS',name)}else{failed++;console.error('FAIL',name,detail||'')}}
function read(p){return fs.readFileSync(path.join(base,p),'utf8')}
function exists(p){return fs.existsSync(path.join(base,p))}
function walk(dir,out=[]){if(!fs.existsSync(dir))return out;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p,out);else out.push(p)}return out}

const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
ok('package/package-lock sürümü eşleşiyor',pkg.version===lock.version&&pkg.version===lock.packages?.['']?.version,`${pkg.version} / ${lock.version}`);
ok('V2.15.0 sürümü',pkg.version==='2.15.0',pkg.version);
ok('node_modules paket dışında',!exists('node_modules'));
ok('.next paket dışında',!exists('.next'));
ok('gerçek .env paket dışında',!exists('.env')&&!exists('.env.production')&&!exists('.env.local'));
ok('örnek env mevcut',exists('.env.example'));
ok('Node 24 pini mevcut',read('.nvmrc').trim()==='24');

const qrLib=read('src/lib/vehicle-qr.ts');
const qrPage=read('src/app/(portal)/arac-qr-km-guncelleme/page.tsx');
const qrDetail=read('src/app/(portal)/arac-qr-km-guncelleme/[vehicleId]/page.tsx');
const qrPrint=read('src/app/(portal)/arac-qr-km-guncelleme/yazdir/page.tsx');
const qrImage=read('src/app/api/vehicle-qr/image/route.ts');
const qrPublic=read('src/app/q/[token]/page.tsx');
const qrPost=read('src/app/api/public/vehicle-km/route.ts');
const install=read('database/install.cjs');
ok('QR liste ikameyi filtreliyor',qrPage.includes('is_replacement=0'));
ok('QR detay ikameyi filtreliyor',qrDetail.includes('is_replacement=0'));
ok('QR yazdırma ikameyi filtreliyor',(qrPrint.match(/is_replacement=0/g)||[]).length>=2);
ok('QR görsel endpoint ikameyi filtreliyor',qrImage.includes('is_replacement=0'));
ok('Public QR sayfası ikameyi reddediyor',qrPublic.includes('is_replacement=0'));
ok('Public QR KM POST ikameyi reddediyor',(qrPost.match(/is_replacement=0/g)||[]).length>=2);
ok('Toplu QR ikameyi hariç tutuyor',qrLib.includes('is_active=1 AND is_replacement=0'));
ok('Tekli QR backend ikameyi reddediyor',qrLib.includes('İkame araçlar Araç QR / KM Güncelleme sistemine dahil edilemez'));
ok('DB trigger ikame QR oluşturmayı engelliyor',install.includes('REPLACEMENT_QR_NOT_ALLOWED'));
ok('Eski ikame QR kayıtları pasifleştiriliyor',install.includes('WHERE v.is_replacement=1 AND q.is_active<>0'));

const requiredPages=[
 'src/app/(portal)/arac-zimmetleri/gecmis/page.tsx','src/app/(portal)/servis-ikame/page.tsx',
 'src/app/(portal)/araclar/[id]/genel/page.tsx','src/app/(portal)/araclar/[id]/zimmet/page.tsx',
 'src/app/(portal)/araclar/[id]/servis-ikame/page.tsx','src/app/(portal)/araclar/[id]/sure-takibi/page.tsx',
 'src/app/(portal)/araclar/[id]/dosyalar/page.tsx','src/app/(portal)/araclar/[id]/gecmis/page.tsx'
];
ok('kritik Türkçe route dosyaları mevcut',requiredPages.every(exists),requiredPages.filter(x=>!exists(x)).join(','));

const schema=require(path.join(base,'database/mysql-schema.cjs')).statements();
const sqliteArtifact=schema.triggers.filter(q=>/\|\||strftime\(|RAISE\s*\(/i.test(q));
ok('MySQL trigger çıktısında SQLite artefaktı yok',sqliteArtifact.length===0,sqliteArtifact.slice(0,3).join('\n'));
ok('MySQL şema üretimi dolu',schema.ddl.length>40&&schema.triggers.length>50&&schema.foreign.length>50);

const srcFiles=walk(path.join(base,'src')).filter(p=>/\.(ts|tsx)$/.test(p));
let englishVisible=[];
const oldRoute=/["'`](\/(?:vehicles|tires|traffic-fines|personnel|reports|inventory|replacement-vehicles|rental-km-tracking|qr-km|damage|service|maintenance|assignments|tasks|calendar|users|audit-log|notifications|attention|search|profile)(?:\/|[?"'`]|$))/;
for(const p of srcFiles){const rel=path.relative(base,p);const s=fs.readFileSync(p,'utf8');if(oldRoute.test(s))englishVisible.push(rel)}
ok('kaynakta kullanıcıya görünen eski İngilizce route yok',englishVisible.length===0,englishVisible.join(','));

const apiFiles=walk(path.join(base,'src/app/api')).filter(p=>p.endsWith('route.ts'));
const unauth=[];
for(const p of apiFiles){const rel=path.relative(base,p).replace(/\\/g,'/'),s=fs.readFileSync(p,'utf8');const mut=/export\s+(?:async\s+function|const)\s+(?:POST|PUT|PATCH|DELETE)\b/.test(s);if(!mut)continue;
 const allowed=/api\/(?:login|logout|setup)\/route\.ts$/.test(rel)||rel==='src/app/api/public/vehicle-km/route.ts';
 const delegated=s.includes("from '@/lib/import-http'")||s.includes('from "@/lib/import-http"');
 const auth=/getCurrentUser|requireUser|requiredApiUser/.test(s);
 if(!allowed&&!delegated&&!auth)unauth.push(rel);
}
ok('mutasyon API route’ları auth katmanı kullanıyor',unauth.length===0,unauth.join(','));

const forbiddenFiles=walk(base).filter(p=>{
 const rel=path.relative(base,p).replace(/\\/g,'/');
 return /(^|\/)\.env(?:\.|$)/.test(rel)&&rel!=='.env.example'||/\.(?:db|sqlite|sqlite3|pem|p12|key)$/.test(rel);
});
ok('deployment paketinde gizli/veri dosyası yok',forbiddenFiles.length===0,forbiddenFiles.map(x=>path.relative(base,x)).join(','));

if(!staticOnly){
 const major=Number(process.versions.node.split('.')[0]);
 ok('çalışma Node sürümü >=24',major>=24,process.version);
 const hasMysql=!!(process.env.MYSQL_URL||(process.env.MYSQL_HOST&&process.env.MYSQL_DATABASE));
 ok('MySQL environment tanımlı',hasMysql,'MYSQL_URL veya MYSQL_HOST+MYSQL_DATABASE gerekli');
 if(process.env.NODE_ENV==='production')ok('production cookie secure',String(process.env.PORTAL_COOKIE_SECURE||'true').toLowerCase()!=='false');
}
console.log(`\nPreflight: ${passed} başarılı, ${failed} hatalı.`);
if(failed)process.exitCode=1;
