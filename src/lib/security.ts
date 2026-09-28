import type { NextRequest } from "next/server";
export function sameOrigin(req:NextRequest){
 const origin=req.headers.get("origin"); if(!origin)return true;
 try{const o=new URL(origin);const host=req.headers.get("x-forwarded-host")||req.headers.get("host")||"";return o.host===host}catch{return false}
}
export function safeRedirectPath(value:string|FormDataEntryValue|null,fallback="/ana-panel"){
 const s=String(value||"");return s.startsWith("/")&&!s.startsWith("//")?s:fallback;
}

export function secureCookieEnabled(){
 const raw=process.env.PORTAL_COOKIE_SECURE?.trim().toLowerCase();
 if(raw==="true")return true;if(raw==="false")return false;
 return process.env.NODE_ENV==="production";
}
