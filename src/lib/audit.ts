import { randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/local/database";

export function auditAction(user:any,action:string,entityType:string,entityId:string,reference:string,oldValue:any,newValue:any,description?:string){
  const db=getDatabase();
  const name=`${user?.first_name||""} ${user?.last_name||""}`.trim()||user?.username||user?.email||"Kullanıcı";
  db.prepare("INSERT INTO audit_logs(id,created_at,user_id,user_name_snapshot,module,action,entity_type,entity_id,entity_reference,old_values,new_values,description,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(randomUUID(),new Date().toISOString(),user?.id||null,name,"Operasyon",action,entityType,entityId,reference,oldValue?JSON.stringify(oldValue):null,newValue?JSON.stringify(newValue):null,description||null,randomUUID());
}
