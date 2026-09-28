function config(){
 const rawUrl=(process.env.MYSQL_URL||'').trim();
 let url=null;
 if(rawUrl){
  try{url=new URL(rawUrl)}catch(e){throw Error('MYSQL_URL geçersiz: '+e.message)}
 }
 const host=url?.hostname||process.env.MYSQL_HOST;
 const database=url?decodeURIComponent(url.pathname.replace(/^\//,'')):process.env.MYSQL_DATABASE;
 const user=url?decodeURIComponent(url.username):process.env.MYSQL_USER;
 const password=url?decodeURIComponent(url.password):process.env.MYSQL_PASSWORD;
 const port=Number(url?.port||process.env.MYSQL_PORT||3306);
 if(!host||!database||!user)throw Error('MySQL bağlantısı eksik: MYSQL_HOST, MYSQL_DATABASE ve MYSQL_USER veya geçerli MYSQL_URL ayarlayın.');
 return {host,port,user,password:password||'',database,charset:'utf8mb4',dateStrings:true,decimalNumbers:true,supportBigNumbers:true,bigNumberStrings:false,connectTimeout:15000,multipleStatements:false};
}
module.exports={config};
