const mysql=require('mysql2/promise');const {config}=require('../database/mysql-config.cjs');const {install}=require('../database/install.cjs');
(async()=>{const c=await mysql.createConnection(config());try{await install(c,{seed:true});console.log('MySQL 2.15.0 şeması hazır.')}finally{await c.end()}})().catch(e=>{console.error(e.message);process.exitCode=1});
