// The SQL worker is external to webpack. Trace its complete runtime dependency tree.
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
function mysqlRuntimeFiles(root){
 const visited=new Set();
 function visit(name,from){
  const resolve=createRequire(path.join(from,'package.json'));let dir=path.dirname(resolve.resolve(name));
  while(true){const file=path.join(dir,'package.json');if(fs.existsSync(file)){const pkg=JSON.parse(fs.readFileSync(file,'utf8'));if(pkg.name===name){if(visited.has(dir))return;visited.add(dir);for(const dep of Object.keys(pkg.dependencies||{}))visit(dep,dir);return}}
   const parent=path.dirname(dir);if(parent===dir)throw Error('Paket kökü bulunamadı: '+name);dir=parent;
  }
 }
 visit('mysql2',root);return [...visited].map(dir=>'./'+path.relative(root,dir).replaceAll('\\','/')+'/**/*');
}
module.exports={mysqlRuntimeFiles};
