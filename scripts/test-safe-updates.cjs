const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),ts=require('typescript'),Module=require('module');
const root=path.resolve(__dirname,'..');
const original=Module._resolveFilename;
Module._resolveFilename=function(name,...args){return original.call(this,name.startsWith('@/')?path.join(root,'src',name.slice(2)):name,...args)};
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
process.env.PORTAL_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'portal-acceptance-'));
const {getDatabase}=require('../src/lib/local/database.ts');
const {planImport,applyImport,excelDate}=require('../src/lib/safe-import.ts');
const {manageEquipmentType}=require('../src/lib/equipment-types.ts');
const {ensureVehicleQr,bulkCreateMissingVehicleQrs}=require('../src/lib/vehicle-qr.ts');
const {calculateVehicleActiveStatus}=require('../src/lib/local/vehicle-state.ts');
const db=getDatabase();db.exec('BEGIN');const now='2026-09-24T10:00:00Z';
const insert=(table,row)=>{const keys=Object.keys(row);db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?')})`).run(...keys.map(k=>row[k]))};
const all=t=>db.prepare(`SELECT * FROM ${t} ORDER BY id`).all();
let passed=0;const test=(name,fn)=>{fn();passed++;console.log('PASS',name)};
insert('users',{id:'u',username:'test',email:'test@example.invalid',password_hash:'test-only',created_at:now,updated_at:now});
insert('personnel',{id:'p',first_name:'Ahmet',last_name:'Yılmaz',company:'ABC A.Ş.',branch:'İstanbul',department:'İdari İşler',phone:'05320000000',created_at:now,updated_at:now});
insert('vehicles',{id:'v',plate:'34 ABC 123',ownership_type:'OWNED',brand:'Test',model:'Test',model_year:2025,vehicle_type:'Otomobil',tire_storage_dealer:'Test',status:'SERVICE',current_odometer:85000,created_at:now,updated_at:now,rental_tracking_enabled:1});
insert('vehicle_service_records',{id:'service',vehicle_id:'v',service_in_at:'2026-09-23',service_name:'Test',service_reason:'Bakım',status:'OPEN',created_at:now,updated_at:now});
insert('equipment',{id:'eq',equipment_type:'Telefon',status:'ASSIGNED',created_at:now,updated_at:now});
insert('personnel_assignments',{id:'pa',personnel_id:'p',equipment_id:'eq',assignment_date:'2026-09-01',created_at:now,updated_at:now});
insert('equipment',{id:'eq2',equipment_type:'Laptop',created_at:now,updated_at:now});
insert('personnel_assignments',{id:'pa2',personnel_id:'p',equipment_id:'eq2',assignment_date:'2025-01-01',return_date:'2025-12-31',status:'RETURNED',created_at:now,updated_at:now});
insert('vehicle_usage_records',{id:'use',vehicle_id:'v',personnel_id:'p',personnel_name_snapshot:'Ahmet Yılmaz',department_snapshot:'İdari İşler',checkout_at:'2026-09-01',checkout_odometer:80000,return_at:'2026-09-02',return_odometer:81000,status:'COMPLETED',created_at:now,updated_at:now});
insert('vehicle_traffic_fines',{id:'fine',vehicle_id:'v',fine_date:'2026-09-01',fine_type:'Test',amount:100,created_at:now});
insert('vehicle_tire_transactions',{id:'tire',vehicle_id:'v',transaction_date:'2026-09-01',transaction_type:'CHANGE',odometer:85000,created_at:now});
insert('vehicle_compliance_documents',{id:'casco',vehicle_id:'v',document_type:'CASCO',end_date:'2026-10-10',created_at:now});
insert('vehicle_compliance_documents',{id:'inspection',vehicle_id:'v',document_type:'INSPECTION',end_date:'2026-10-15',created_at:now});
insert('vehicle_assignments',{id:'va',vehicle_id:'v',personnel_id:'p',assigned_to:'Ahmet Yılmaz',delivery_date:'2025-01-01',return_date:'2025-12-31',created_at:now});
const inputs=[{row:2,values:['34abc123','','20.12.2026','','']}];
test('KABUL: Servisteki 85.000 KM araçta yalnızca muayene değişir; tüm ilişkiler korunur',()=>{
 const tables=['vehicles','vehicle_service_records','vehicle_usage_records','vehicle_traffic_fines','vehicle_tire_transactions','personnel_assignments','vehicle_odometer_history','vehicle_replacement_records','vehicle_qr_codes','vehicle_rental_contracts'];
 const before=Object.fromEntries(tables.map(t=>[t,all(t)]));const p=planImport(db,'compliance',inputs);
 assert.equal(p[0].status,'update');assert.equal(applyImport(db,'compliance',inputs,p,'u').updated,1);
 for(const t of tables)assert.deepEqual(all(t),before[t],t);
 assert.equal(db.prepare("SELECT end_date FROM vehicle_compliance_documents WHERE id='inspection'").get().end_date,'2026-12-20');
 assert.equal(db.prepare("SELECT end_date FROM vehicle_compliance_documents WHERE id='casco'").get().end_date,'2026-10-10');
 assert.equal(all('compliance_change_history')[0].old_date,'2026-10-15');
});
test('Boş tarihler, tekrar yükleme, bulunamayan ve yinelenen plakalar',()=>{
 assert.equal(planImport(db,'compliance',inputs)[0].status,'unchanged');
 assert.equal(planImport(db,'compliance',[{row:2,values:['00 XXX 000','','2026-12-20']}])[0].status,'missing');
 assert.ok(planImport(db,'compliance',[...inputs,{...inputs[0],row:3}]).every(r=>r.status==='error'));
 assert.equal(planImport(db,'compliance',[{row:2,values:['34ABC123','','31.02.2026']}])[0].status,'error');
});
test('KABUL: Personel kimliği, aktif zimmet, eski şube/birim ve araç geçmişi korunur',()=>{
 const before=all('personnel_assignments'),usage=all('vehicle_usage_records'),assignments=all('vehicle_assignments');
 const rows=[{row:2,id:'p',values:['Ahmet','Yılmaz','','ABC A.Ş.','Ankara','Operasyon','']}];
 const p=planImport(db,'personnel',rows);assert.equal(p[0].status,'update');assert.equal(applyImport(db,'personnel',rows,p,'u').updated,1);
 assert.equal(all('personnel').length,1);const person=all('personnel')[0];assert.equal(person.id,'p');assert.equal(person.branch,'Ankara');assert.equal(person.department,'Operasyon');assert.equal(person.phone,'05320000000');
 assert.deepEqual(all('personnel_assignments'),before);assert.deepEqual(all('vehicle_usage_records'),usage);assert.deepEqual(all('vehicle_assignments'),assignments);assert.equal(JSON.parse(assignments[0].personnel_snapshot).branch,'İstanbul');
 const snap=JSON.parse(before[0].personnel_snapshot);assert.equal(snap.branch,'İstanbul');assert.equal(snap.department,'İdari İşler');
});
test('Aynı isim yeni kişi oluşturabilir; yalnızca kimlik mevcut kişiyi günceller',()=>{
 assert.equal(planImport(db,'personnel',[{row:2,values:['Ahmet','Yılmaz','','ABC','Ankara','Operasyon']}])[0].status,'new');
 assert.equal(planImport(db,'personnel',[{row:2,id:'p',values:['Ahmet Ali','Yılmaz','','','','']}])[0].status,'update');
 assert.equal(planImport(db,'personnel',[{row:2,id:'missing',values:['Ahmet','Yılmaz','','','','']}])[0].status,'error');
});
test('Önizlemeden sonra değişen hedef alanın üzerine yazılmaz',()=>{
 const rows=[{row:2,id:'p',values:['','','','','İzmir','','']}],p=planImport(db,'personnel',rows);
 db.prepare("UPDATE personnel SET branch='Bursa' WHERE id='p'").run();
 const result=applyImport(db,'personnel',rows,p,'u');assert.equal(result.updated,0);assert.equal(result.errors.length,1);assert.equal(all('personnel')[0].branch,'Bursa');
});
test('Yeni personel oluşturma, zorunlu alan ve Excel tarih kontrolü',()=>{
 const rows=[{row:2,values:['Ayşe','Demir','','ABC','İzmir','Finans','Kimlik']}],p=planImport(db,'personnel',rows);assert.equal(p[0].status,'new');assert.equal(applyImport(db,'personnel',rows,p,'u').new,1);
 assert.equal(planImport(db,'personnel',[{row:2,values:['Yeni','Kişi']}])[0].status,'error');
 assert.equal(excelDate(46376),'2026-12-20');assert.throws(()=>excelDate('2026-02-30'));
});
test('İkame aktif araç listesine girer; ana araç ilişkisi ve kullanım geçmişi iade sonrası korunur',()=>{
 insert('vehicle_replacement_records',{id:'r',vehicle_id:'v',source_type:'SERVICE',source_id:'service',replacement_plate:'34 XYZ 456',replacement_received_at:'2026-09-23',created_at:now,updated_at:now});
 const r=all('vehicle_replacement_records')[0],vehicle=db.prepare('SELECT * FROM vehicles WHERE id=?').get(r.replacement_vehicle_id);assert.equal(vehicle.is_replacement,1);assert.equal(vehicle.is_active,1);
 insert('vehicle_usage_records',{id:'ru',vehicle_id:vehicle.id,personnel_id:'p',personnel_name_snapshot:'Ahmet Yılmaz',checkout_at:'2026-09-23T12:00',checkout_odometer:0,checkout_km_known:0,created_at:now,updated_at:now});
 const usage=db.prepare("SELECT * FROM vehicle_usage_records WHERE id='ru'").get();assert.equal(usage.main_plate_snapshot,'34 ABC 123');assert.equal(usage.replacement_record_id,'r');
 assert.throws(()=>db.prepare("UPDATE vehicle_replacement_records SET status='RETURNED' WHERE id='r'").run(),/personelde/);
 db.prepare("UPDATE vehicle_usage_records SET status='COMPLETED',return_at='2026-09-24T10:00' WHERE id='ru'").run();
 const before=db.prepare("SELECT * FROM vehicle_usage_records WHERE id='ru'").get();db.prepare("UPDATE vehicle_replacement_records SET status='RETURNED',replacement_returned_at='2026-09-24T10:00' WHERE id='r'").run();
 assert.equal(db.prepare('SELECT is_active FROM vehicles WHERE id=?').get(vehicle.id).is_active,0);assert.deepEqual(db.prepare("SELECT * FROM vehicle_usage_records WHERE id='ru'").get(),before);
});
test('Ekipman türü ekleme, düzenleme ve bağlı türde silme koruması',()=>{
 const r=db.prepare("SELECT id FROM system_definitions WHERE category='equipment_type' AND name='Telefon'").get();assert.throws(()=>manageEquipmentType(db,'delete',r.id,''),/1 kayıt/);
 manageEquipmentType(db,'rename',r.id,'Akıllı Telefon');assert.equal(db.prepare("SELECT equipment_type FROM equipment WHERE id='eq'").get().equipment_type,'Akıllı Telefon');
 manageEquipmentType(db,'deactivate',r.id,'');assert.equal(db.prepare('SELECT is_active FROM system_definitions WHERE id=?').get(r.id).is_active,0);
 manageEquipmentType(db,'create','','All in One');assert.ok(db.prepare("SELECT id FROM system_definitions WHERE name='All in One'").get());
});
test('Geçmiş belge tarihi daha ileri olsa da açıkça güncellenen tarih geçerlidir',()=>{
 insert('vehicle_compliance_documents',{id:'older',vehicle_id:'v',document_type:'INSPECTION',end_date:'2028-01-01',created_at:now});
 const rows=[{row:2,values:['34 ABC 123','','2026-12-01','','']}];const p=planImport(db,'compliance',rows);applyImport(db,'compliance',rows,p,'u');
 assert.equal(planImport(db,'compliance',rows)[0].status,'unchanged');
 assert.equal(db.prepare("SELECT document_id FROM compliance_current WHERE vehicle_id='v' AND document_type='INSPECTION'").get().document_id,'older');
});
test('İkame plaka daha sonraki süreçte tekrar aktif kullanılabilir',()=>{
 db.prepare("UPDATE vehicles SET status='INACTIVE' WHERE id='replacement:r'").run();
 insert('vehicle_replacement_records',{id:'r2',vehicle_id:'v',source_type:'SERVICE',source_id:'service-2',replacement_plate:'34XYZ456',replacement_received_at:'2026-09-24',created_at:now,updated_at:now});
 const v=db.prepare("SELECT * FROM vehicles WHERE id='replacement:r'").get();assert.equal(v.is_active,1);assert.equal(v.status,'REPLACEMENT');assert.equal(calculateVehicleActiveStatus(db,v.id),'REPLACEMENT');assert.equal(db.prepare("SELECT main_plate_snapshot FROM vehicle_usage_records WHERE id='ru'").get().main_plate_snapshot,'34 ABC 123');
});

test('İkame araç QR sistemine hiçbir katmandan dahil edilemez',()=>{
 const replacement=db.prepare("SELECT id FROM vehicles WHERE is_replacement=1 AND is_active=1 ORDER BY id LIMIT 1").get();assert.ok(replacement?.id);
 assert.throws(()=>ensureVehicleQr(db,replacement.id,'u'),/QR \/ KM Güncelleme sistemine dahil edilemez/);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM vehicle_qr_codes WHERE vehicle_id=?").get(replacement.id).n,0);
 assert.throws(()=>insert('vehicle_qr_codes',{id:'illegal-replacement-qr',vehicle_id:replacement.id,token:'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN1234567890',is_active:1,created_at:now,updated_at:now}),/REPLACEMENT_QR_NOT_ALLOWED/);
 const normalBefore=db.prepare("SELECT COUNT(*) n FROM vehicle_qr_codes WHERE vehicle_id='v'").get().n;bulkCreateMissingVehicleQrs(db,'u');
 assert.equal(db.prepare("SELECT COUNT(*) n FROM vehicle_qr_codes WHERE vehicle_id='v'").get().n,1);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM vehicle_qr_codes q JOIN vehicles v ON v.id=q.vehicle_id WHERE v.is_replacement=1").get().n,0);
 assert.ok(normalBefore===0||normalBefore===1);
});
test('Türkçe harf, büyük/küçük harf ve çok parçalı arama',()=>{
 for(const q of ['meh yıl','MEH YIL','mehmet yilmaz','MEHMET YİLMAZ'])assert.equal(db.prepare('SELECT portal_search(?,?) result').get('Mehmet Yılmaz','%'+q+'%').result,1);
 for(const q of ['İDARİ','idari','ıdarı'])assert.equal(db.prepare('SELECT portal_search(?,?) result').get('İdari İşler','%'+q+'%').result,1);
 assert.equal(db.prepare("SELECT id FROM personnel WHERE first_name||' '||last_name LIKE ? COLLATE NOCASE").all('%ah yıl%').length,1);
});
test('Aynı servis dosyasında eski ikame kapanır ve yeni ikame ayrı kayıt olarak açılır',()=>{
 db.prepare("UPDATE vehicle_replacement_records SET status='RETURNED',replacement_returned_at='2026-09-24T14:00',return_reason='Araç değişimi' WHERE id='r2'").run();
 insert('vehicle_replacement_records',{id:'r3',vehicle_id:'v',source_type:'SERVICE',source_id:'service-2',replacement_plate:'34 NEW 789',replacement_received_at:'2026-09-24T14:05',status:'ACTIVE',created_at:now,updated_at:now});
 assert.equal(db.prepare("SELECT status FROM vehicle_replacement_records WHERE id='r2'").get().status,'RETURNED');
 assert.equal(db.prepare("SELECT status FROM vehicle_replacement_records WHERE id='r3'").get().status,'ACTIVE');
 assert.equal(db.prepare("SELECT COUNT(*) n FROM vehicle_replacement_records WHERE source_id='service-2'").get().n,2);
});
test('Aynı isimli iki kayıt ayrı kimlikte tutulur ve ID ile güncellenir',()=>{
 const rows=[{row:2,values:['Ahmet','Yılmaz','','ABC','İzmir','Finans','']},{row:3,values:['Ahmet','Yılmaz','','ABC','Bursa','Satış','']}];
 const plan=planImport(db,'personnel',rows);assert.ok(plan.every(p=>p.status==='new'));assert.equal(applyImport(db,'personnel',rows,plan,'u').new,2);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM personnel WHERE first_name='Ahmet' AND last_name='Yılmaz'").get().n,3);
});
test('Silme koruması ve silinen kişinin geçmişinin korunması',()=>{
 assert.throws(()=>db.prepare("UPDATE personnel SET status='DELETED' WHERE id='p'").run(),/Aktif zimmet/);
 insert('personnel',{id:'delete-test',first_name:'İrem',last_name:'Şahin',created_at:now,updated_at:now});
 insert('personnel_assignments',{id:'archive-test',personnel_id:'delete-test',equipment_id:'eq2',assignment_date:'2025-01-01',return_date:'2025-02-01',status:'RETURNED',created_at:now,updated_at:now});
 const before=db.prepare("SELECT * FROM personnel_assignments WHERE id='archive-test'").get();
 db.prepare("UPDATE personnel SET status='DELETED',deleted_at=? WHERE id='delete-test'").run(now);
 assert.deepEqual(db.prepare("SELECT * FROM personnel_assignments WHERE id='archive-test'").get(),before);
 assert.equal(planImport(db,'personnel',[{row:2,id:'delete-test',values:['İrem','Şahin','','A','B','C']}])[0].status,'error');
 assert.throws(()=>insert('personnel_assignments',{id:'invalid-reassign',personnel_id:'delete-test',equipment_id:'eq2',assignment_date:now,created_at:now,updated_at:now}),/Aktif personel/);
});
test('MySQL yabancı anahtar, CHECK ve Türkçe arama koruması',()=>{
 assert.throws(()=>insert('case_services',{id:'negative',vehicle_id:'v',source_type:'ACCIDENT',source_id:'test-check',service_name:'Test',entry_at:'2026-01-01',entry_km:-1,created_at:now}),/check|violated/i);
 assert.throws(()=>insert('vehicle_assignments',{id:'broken',vehicle_id:'missing',assigned_to:'Test',delivery_date:'2025-01-01',return_date:'2025-02-01',created_at:now}),/foreign key/i);
 assert.equal(db.prepare('SELECT portal_search(?,?) result').get('İrem Şahin','%IREM SAHIN%').result,1);
});
console.log(passed+' MySQL acceptance groups passed. All fixtures rolled back.');db.exec('ROLLBACK');db.close();
