function tokens(sql){return sql.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|`[^`]*`|@?[A-Za-z_][\w.]*|\d+(?:\.\d+)?|\|\||<=>|<>|!=|<=|>=|[^\s]/g)||[]}
function translate(sql){
 let s=sql.trim().replace(/\bBEGIN IMMEDIATE\b/gi,'START TRANSACTION').replace(/\bRELEASE (?!SAVEPOINT)(\w+)/gi,'RELEASE SAVEPOINT $1').replace(/\bROLLBACK TO (?!SAVEPOINT)(\w+)/gi,'ROLLBACK TO SAVEPOINT $1');
 if(/^PRAGMA table_info\((\w+)\)/i.test(s)){const name=s.match(/^PRAGMA table_info\((\w+)\)/i)[1];return `SELECT COLUMN_NAME name,DATA_TYPE type,IS_NULLABLE nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${name}' ORDER BY ORDINAL_POSITION`}
 s=s.replace(/\bCOLLATE NOCASE\b/gi,'COLLATE utf8mb4_tr_0900_ai_ci').replace(/\bINSERT OR IGNORE\b/gi,'INSERT IGNORE');
 s=s.replace(/ON CONFLICT\s*\([^)]*\)\s*DO UPDATE SET/gi,'ON DUPLICATE KEY UPDATE').replace(/excluded\.(\w+)/gi,'VALUES($1)');
 s=s.replace(/ON CONFLICT\s*\((\w+)[^)]*\)\s*DO NOTHING/gi,'ON DUPLICATE KEY UPDATE $1=$1');
 s=s.replace(/date\(\?,\s*'\+(\d+) days?'\)/gi,'DATE_ADD(DATE(?), INTERVAL $1 DAY)').replace(/date\(\?,\s*\?\)/gi,'DATE_ADD(DATE(?), INTERVAL CAST(? AS SIGNED) DAY)');
 s=s.replace(/\b(?:julianday|datetime)\((\w+(?:\.\w+)?)\)/gi,"STR_TO_DATE(REPLACE(LEFT($1,19),'T',' '),'%Y-%m-%d %H:%i:%s')");
 s=s.replace(/CAST\(([^()]+) AS INTEGER\)/gi,'CAST($1 AS SIGNED)').replace(/strftime\('%Y-%m-%dT%H:%M:%fZ','now'\)/g,"DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ')").replace(/strftime\('%Y','now'\)/g,'YEAR(UTC_TIMESTAMP())').replace(/lower\(hex\(randomblob\(16\)\)\)/gi,"REPLACE(UUID(),'-','')");
 // Keep parameter ordering while replacing all bound LIKE expressions with token search.
 const t=tokens(s);
 for(let i=0;i<t.length;i++)if(t[i].toUpperCase()==='LIKE'&&t[i+1]==='?'){
  let a=i-1,depth=0;
  for(;a>=0;a--){const v=t[a].toUpperCase();if(v===')')depth++;else if(v==='('){if(!depth)break;depth--;}if(!depth&&['WHERE','AND','OR','WHEN','THEN','SELECT','ON',',','=','<>','!='].includes(v))break;}
  const start=a+1,left=t.slice(start,i).join(' ');let end=i+2;if(t[end]?.toUpperCase()==='COLLATE')end+=2;
  t.splice(start,end-start,`portal_search(${left}, ?)`);i=start;
 }
 return t.join(' ').replace(/ AS INTEGER\b/gi,' AS SIGNED');
}
module.exports={translate};

