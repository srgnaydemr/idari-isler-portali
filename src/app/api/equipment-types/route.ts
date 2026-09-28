import {NextRequest,NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/local/auth';
import {getDatabase} from '@/lib/local/database';
import {sameOrigin} from '@/lib/security';
import {localRedirectUrl} from '@/lib/local/redirect-url';
import {manageEquipmentType} from '@/lib/equipment-types';
import {auditAction} from '@/lib/audit';
export async function POST(req:NextRequest){
 const user=await getCurrentUser();if(!user)return new NextResponse('Yetkisiz',{status:401});
 if(!sameOrigin(req))return new NextResponse('Geçersiz istek',{status:403});
 const fd=await req.formData(),op=String(fd.get('operation')||''),id=String(fd.get('id')||''),name=String(fd.get('name')||''),url=localRedirectUrl(req,'/envanter-turleri');
 try{const db=getDatabase(),old=db.prepare('SELECT * FROM system_definitions WHERE id=?').get(id);manageEquipmentType(db,op,id,name);auditAction(user,'Ekipman türü '+op,'equipment_type',id||name,name,old,{operation:op,name});url.searchParams.set('saved','1')}
 catch(e){url.searchParams.set('error',(e as Error).message)}
 return NextResponse.redirect(url,303);
}
