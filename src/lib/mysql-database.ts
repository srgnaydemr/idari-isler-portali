import {Worker,MessageChannel,receiveMessageOnPort} from 'node:worker_threads';
import path from 'node:path';
import fs from 'node:fs';
/** Compatibility boundary: all SQL executes on MySQL, on a pooled connection.
 * Existing synchronous transaction blocks cannot interleave on this process.
 * The worker pins one connection until COMMIT/ROLLBACK. No SQLite mirror/cache. */
export class MysqlDatabase {
 private signal=new Int32Array(new SharedArrayBuffer(4));
 private channel=new MessageChannel();
 private worker:Worker;
 private closed=false;
 constructor(){const file=path.join(process.cwd(),'database/mysql-worker.cjs');if(!fs.existsSync(file))throw new Error('MySQL çalışma dosyası eksik. database dizinini dağıtım köküne kopyalayın.');this.worker=new Worker(file,{workerData:{port:this.channel.port2,signal:this.signal.buffer},transferList:[this.channel.port2]});this.worker.on('error',()=>{this.closed=true});this.worker.unref();this.channel.port1.unref();}
 private call(sql:string,args:any[],mode:string):any{
  if(this.closed)throw new Error('MySQL bağlantısı kapalı.');
  Atomics.store(this.signal,0,0);this.channel.port1.postMessage({sql,args,mode});
  if(Atomics.wait(this.signal,0,0,30000)==='timed-out'){this.closed=true;void this.worker.terminate();throw new Error('MySQL yanıt süresi aşıldı. İşlem sonucu doğrulanmadan tekrar göndermeyin.');}
  const r=receiveMessageOnPort(this.channel.port1)?.message;
  if(!r?.ok)throw Object.assign(new Error(r?.error?.message||'MySQL bağlantı hatası'),{code:r?.error?.code});return r.value;
 }
 prepare(sql:string){return {all:(...args:any[])=>this.call(sql,args,'all'),get:(...args:any[])=>this.call(sql,args,'get'),run:(...args:any[])=>this.call(sql,args,'run')}}
 exec(sql:string){for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))this.call(statement,[],'run');}
 close(){this.closed=true;void this.worker.terminate();this.channel.port1.close()}
}
