const {workerData}=require('node:worker_threads');
const mysql=require('mysql2/promise');
const {config}=require('./mysql-config.cjs');
const {translate}=require('./sql-dialect.cjs');
const port=workerData.port,signal=new Int32Array(workerData.signal);
let pool,setupError;
try{pool=mysql.createPool({...config(),connectionLimit:Number(process.env.MYSQL_POOL_SIZE||5),waitForConnections:true,queueLimit:100})}catch(e){setupError=e}
let transaction=null,rootSavepoint=null;
async function acquire(){const c=await pool.getConnection();await c.query("SET SESSION sql_mode='STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,PIPES_AS_CONCAT,IGNORE_SPACE', time_zone='+00:00'");return c}
async function run({sql,args,mode}){
 if(setupError)throw setupError;
 const upper=sql.trim().toUpperCase();
 if(/^SAVEPOINT /.test(upper)&&!transaction){transaction=await acquire();await transaction.beginTransaction();rootSavepoint=upper.split(/\s+/)[1];}
 if(rootSavepoint&&/^RELEASE (SAVEPOINT )?/.test(upper)&&upper.split(/\s+/).at(-1)===rootSavepoint){const c=transaction;transaction=null;rootSavepoint=null;try{await c.commit()}finally{c.release()}return null}
 if(/^BEGIN|^START TRANSACTION/.test(upper)){if(transaction)throw Error('İç içe transaction yerine SAVEPOINT kullanın.');transaction=await acquire();await transaction.beginTransaction();return null}
 if(upper==='COMMIT'||upper==='ROLLBACK'){if(!transaction)throw Error('Açık transaction yok.');const c=transaction;transaction=null;rootSavepoint=null;try{await c.query(upper)}finally{c.release()}return null}
 const c=transaction||await acquire();
 try{
  const [rows]=await c.query(translate(sql),args||[]);
  if(mode==='get')return rows[0];if(mode==='all')return rows;
  return {changes:rows.affectedRows||0,lastInsertRowid:rows.insertId||0};
 }finally{if(c!==transaction)c.release()}
}
port.on('message',async message=>{
 let response;
 try{response={ok:true,value:await run(message)}}catch(e){response={ok:false,error:{message:e.message,code:e.code}}}
 port.postMessage(response);Atomics.store(signal,0,1);Atomics.notify(signal,0);
});

