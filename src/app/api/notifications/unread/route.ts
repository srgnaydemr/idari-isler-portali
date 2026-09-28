import {NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/local/auth";
import {createLocalServerClient} from "@/lib/local/client";
import {getDatabase} from "@/lib/local/database";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(){
  const user=await getCurrentUser();
  if(!user)return NextResponse.json({unread:0},{status:401});
  const client=createLocalServerClient(user.id);
  await client.rpc("refresh_reminder_notifications");
  const db=getDatabase();
  const unread=Number((db.prepare("SELECT count(*) c FROM notifications WHERE user_id=? AND is_read=0").get(user.id) as any)?.c||0);
  return NextResponse.json({unread},{headers:{"Cache-Control":"no-store"}});
}
