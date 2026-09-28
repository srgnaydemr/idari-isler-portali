const catalog=require('./legacy-schema.json');
const legacyTriggers=require('./legacy-triggers.json');
const {translate}=require('./sql-dialect.cjs');
const quote=s=>'`'+String(s).replace(/`/g,'``')+'`';
function tableDDL(t){
 const indexed=new Set(t.columns.filter(c=>c.pk).map(c=>c.name));
 for(const i of t.indexes)for(const c of t.columns)if(i.columns.some(x=>x.name===c.name)||new RegExp('\\b'+c.name+'\\b').test(i.sql||''))indexed.add(c.name);
 const cols=t.columns.map(c=>{
  const id=c.name==='id'||c.name.endsWith('_id')||c.name.endsWith('_by');
  const number=/INT|REAL|NUM|DEC/i.test(c.type),bool=/^(is_|has_)|_enabled$|_known$|_provided$/.test(c.name);
  let type=number?(bool?'TINYINT':/REAL|DEC/i.test(c.type)?(/cost|amount|price/.test(c.name)?'DECIMAL(30,10)':'DOUBLE'):'BIGINT'):id?'VARCHAR(64) COLLATE utf8mb4_bin':indexed.has(c.name)?'VARCHAR(191)':/(_at|_date|_time)$/.test(c.name)?'VARCHAR(40)':/name|status|type|code|plate|phone|company|branch|department|title|username|email|reference|token_hash/.test(c.name)?'VARCHAR(255)':'LONGTEXT';
  const auto=c.pk&&number&&t.columns.filter(x=>x.pk).length===1;
  let def=c.dflt_value==null?'':` DEFAULT ${c.dflt_value}`;if(type==='LONGTEXT'&&def)def=` DEFAULT (${c.dflt_value})`;
  return `${quote(c.name)} ${type}${c.notnull||c.pk?' NOT NULL':''}${auto?' AUTO_INCREMENT':def}`;
 });
 const pk=t.columns.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk);if(pk.length)cols.push('PRIMARY KEY ('+pk.map(c=>quote(c.name)).join(',')+')');
 return `CREATE TABLE IF NOT EXISTS ${quote(t.name)} (${cols.join(',\n')}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci`;
}
function indexDDL(t,i){
 if(i.origin==='pk')return null;
 if(t.name==='vehicle_replacement_records'&&i.unique&&i.columns.map(c=>c.name).join(',')==='source_type,source_id')return null;
 const name=i.name.startsWith('sqlite_autoindex_')?'uq_'+t.name+'_'+i.seq:i.name;
 let expressions=i.columns.map(c=>quote(c.name)).join(',');let where='';
 if(i.sql){const match=i.sql.match(/ON\s+\w+\s*\(([\s\S]*)\)(?:\s+WHERE\s+([\s\S]+))?$/i);if(!match)throw Error('Index çözümlenemedi: '+i.sql);expressions=match[1].replace(/COLLATE NOCASE/gi,'COLLATE utf8mb4_tr_0900_ai_ci');where=match[2]||'';}
 if(where){const parts=i.columns.every(c=>c.name)?i.columns.map(c=>quote(c.name)):[expressions];expressions=parts.map(p=>`(CASE WHEN ${where} THEN ${p} ELSE NULL END)`).join(',');}
 else if(/\(|COLLATE/i.test(expressions))expressions=`(${expressions})`;
 return `CREATE ${i.unique?'UNIQUE ':''}INDEX ${quote(name.slice(0,64))} ON ${quote(t.name)} (${expressions})`;
}
function foreignDDL(t){return t.fks.map((f,i)=>`ALTER TABLE ${quote(t.name)} ADD CONSTRAINT ${quote(('fk_'+t.name+'_'+i).slice(0,64))} FOREIGN KEY (${quote(f.from)}) REFERENCES ${quote(f.table)} (${quote(f.to)}) ON DELETE ${f.on_delete==='CASCADE'?'CASCADE':'RESTRICT'} ON UPDATE RESTRICT`)}
function triggerDDL(t){
 const m=t.sql.match(/^CREATE TRIGGER\s+(\w+)\s+(BEFORE|AFTER)\s+(INSERT|UPDATE|DELETE)(?:\s+OF\s+([\w,]+))?\s+ON\s+(\w+)(?:\s+WHEN\s+([\s\S]+?))?\s+BEGIN\s*([\s\S]*)END\s*;?$/i);
 if(!m)throw Error('Trigger çözümlenemedi: '+t.name);
 let [,name,timing,event,columns,table,condition,body]=m;
 if(name.startsWith('snapshot_')){timing='BEFORE';body=`SET NEW.personnel_snapshot=COALESCE(NEW.personnel_snapshot,(SELECT json_object('first_name',first_name,'last_name',last_name,'company',company,'branch',branch,'department',department) FROM personnel WHERE id=NEW.personnel_id));`;}
 if(name==='usage_replacement_snapshot'){timing='BEFORE';body="SET NEW.replacement_record_id=(SELECT id FROM vehicle_replacement_records WHERE replacement_vehicle_id=NEW.vehicle_id AND status='ACTIVE' LIMIT 1); SET NEW.main_plate_snapshot=(SELECT v.plate FROM vehicle_replacement_records r JOIN vehicles v ON v.id=r.vehicle_id WHERE r.replacement_vehicle_id=NEW.vehicle_id AND r.status='ACTIVE' LIMIT 1);";}
 if(name==='replacement_vehicle_insert'||name==='replacement_vehicle_update'){
  timing='BEFORE';body=body.replace(/UPDATE vehicle_replacement_records SET replacement_vehicle_id=([\s\S]*?) WHERE id=NEW.id;/,'SET NEW.replacement_vehicle_id=$1;');body=body.slice(0,body.indexOf('UPDATE vehicles SET'));body=body.replace(/'replacement:'\s*\|\|\s*NEW\.id/g,"CONCAT('replacement:',NEW.id)");
 }
 body=body.replace(/SELECT CASE WHEN ([\s\S]+?) THEN RAISE\(ABORT,'([^']*)'\) END;/g,"IF $1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='$2'; END IF;").replace(/SELECT RAISE\(ABORT,'([^']*)'\);/g,"SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='$1';");
 if(columns){const changed=columns.split(',').map(c=>`NOT (NEW.${c} <=> OLD.${c})`).join(' OR ');condition=condition?`(${condition}) AND (${changed})`:changed;}
 if(condition)body=`IF ${condition} THEN ${body} END IF;`;
 return translate(`CREATE TRIGGER ${name} ${timing} ${event} ON ${table} FOR EACH ROW BEGIN IF COALESCE(@portal_import,0)=0 THEN ${body} END IF; END`);
}
function foldSql(value){let s=`LOWER(COALESCE(${value},'') COLLATE utf8mb4_unicode_ci)`;for(const [a,b] of [['ı','i'],['İ','i'],['ç','c'],['ğ','g'],['ö','o'],['ş','s'],['ü','u'],['â','a'],['î','i'],['û','u']])s=`REPLACE(${s},'${a}','${b}')`;return s}
const searchFunction=`CREATE FUNCTION portal_search(hay LONGTEXT,pattern LONGTEXT) RETURNS TINYINT DETERMINISTIC NO SQL
 BEGIN DECLARE content LONGTEXT; DECLARE rest LONGTEXT; DECLARE word LONGTEXT; DECLARE n INT;
 SET content=${foldSql('hay')};
 SET rest=${foldSql('pattern')};
 IF LEFT(pattern,1)<>'%' OR RIGHT(pattern,1)<>'%' THEN RETURN content LIKE rest COLLATE utf8mb4_tr_0900_ai_ci; END IF;
 SET rest=TRIM(REPLACE(REPLACE(rest,'%',''),'_',' '));
 WHILE LENGTH(rest)>0 DO SET n=LOCATE(' ',rest); IF n=0 THEN SET word=rest; SET rest=''; ELSE SET word=LEFT(rest,n-1); SET rest=TRIM(SUBSTRING(rest,n+1)); END IF;
 IF LENGTH(word)>0 AND LOCATE(word COLLATE utf8mb4_tr_0900_ai_ci,content)=0 AND LOCATE(word COLLATE utf8mb4_tr_0900_ai_ci,REPLACE(content,' ',''))=0 THEN RETURN 0; END IF; END WHILE; RETURN 1; END`;
function statements(){
 const ddl=catalog.map(tableDDL),indexes=catalog.flatMap(t=>t.indexes.map(i=>indexDDL(t,i)).filter(Boolean)),foreign=catalog.flatMap(foreignDDL),triggers=legacyTriggers.map(triggerDDL);
 const checks=[];
 for(const t of catalog){const re=/\bCHECK\s*\(/gi;let m,n=0;while((m=re.exec(t.sql))){let depth=1,i=re.lastIndex,quoted=false;const begin=i;for(;i<t.sql.length&&depth;i++){if(t.sql[i]==="'"){if(quoted&&t.sql[i+1]==="'"){i++;continue}quoted=!quoted}else if(!quoted){if(t.sql[i]==='(')depth++;if(t.sql[i]===')')depth--}}checks.push(`ALTER TABLE ${quote(t.name)} ADD CONSTRAINT ${quote('ck_'+t.name+'_'+n++)} CHECK (${t.sql.slice(begin,i-1)})`);re.lastIndex=i}}
 for(const op of ['INSERT','UPDATE'])triggers.push(`CREATE TRIGGER replacement_visibility_${op.toLowerCase()} AFTER ${op} ON vehicle_replacement_records FOR EACH ROW BEGIN IF COALESCE(@portal_import,0)=0 THEN UPDATE vehicles SET is_active=CASE WHEN NEW.status='ACTIVE' THEN 1 ELSE 0 END,status=CASE WHEN NEW.status='ACTIVE' AND status='INACTIVE' THEN 'REPLACEMENT' WHEN NEW.status<>'ACTIVE' THEN 'INACTIVE' ELSE status END WHERE id=NEW.replacement_vehicle_id; END IF; END`);
 indexes.push("CREATE UNIQUE INDEX `uq_replacement_active_plate` ON `vehicle_replacement_records` ((CASE WHEN status='ACTIVE' THEN REPLACE(UPPER(replacement_plate),' ','') ELSE NULL END))");
 for(const [table,column,parent] of [['vehicle_assignments','personnel_id','personnel'],['vehicle_replacement_records','replacement_vehicle_id','vehicles'],['vehicle_usage_records','replacement_record_id','vehicle_replacement_records'],['compliance_current','vehicle_id','vehicles'],['compliance_current','document_id','vehicle_compliance_documents'],['compliance_change_history','vehicle_id','vehicles'],['import_previews','user_id','users']])foreign.push(`ALTER TABLE ${quote(table)} ADD CONSTRAINT ${quote(('fk_v213_'+table+'_'+column).slice(0,63))} FOREIGN KEY (${quote(column)}) REFERENCES ${quote(parent)} (id) ON DELETE RESTRICT`);
 for(const [table,active] of [['personnel_assignments',"NEW.status='ACTIVE' AND NEW.return_date IS NULL"],['vehicle_usage_records',"NEW.status='IN_USE' AND NEW.return_at IS NULL"],['vehicle_assignments','NEW.return_date IS NULL']])for(const event of ['INSERT','UPDATE'])triggers.push(`CREATE TRIGGER bind_person_${table}_${event.toLowerCase()} BEFORE ${event} ON ${table} FOR EACH ROW BEGIN DECLARE state VARCHAR(255); IF COALESCE(@portal_import,0)=0 AND NEW.personnel_id IS NOT NULL AND (${active}) THEN SELECT status INTO state FROM personnel WHERE id=NEW.personnel_id FOR UPDATE; IF state<>'ACTIVE' OR state IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Aktif personel bulunamadı.'; END IF; END IF; END`);
 triggers.push(`CREATE TRIGGER personnel_delete_guard BEFORE UPDATE ON personnel FOR EACH ROW BEGIN IF COALESCE(@portal_import,0)=0 AND NEW.status='DELETED' AND OLD.status<>'DELETED' THEN IF EXISTS(SELECT 1 FROM personnel_assignments WHERE personnel_id=OLD.id AND status='ACTIVE' AND return_date IS NULL) OR EXISTS(SELECT 1 FROM vehicle_usage_records WHERE personnel_id=OLD.id AND status='IN_USE' AND return_at IS NULL) OR EXISTS(SELECT 1 FROM vehicle_assignments WHERE personnel_id=OLD.id AND return_date IS NULL) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Aktif zimmet veya araç kullanımı var; önce iade alın.'; END IF; END IF; END`);
 return {ddl,indexes,foreign,triggers,checks,searchFunction};
}
module.exports={catalog,statements,tableDDL,indexDDL,foreignDDL,quote};

