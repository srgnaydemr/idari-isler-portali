import {redirect} from "next/navigation";
import{createLocalServerClient}from"@/lib/local/client";
import{getCurrentUser,hasUsers,signOut}from"@/lib/local/auth";
export async function requireUser(){if(!(await hasUsers()))redirect("/setup");const user=await getCurrentUser();if(!user)redirect("/login");if(!user.is_active){await signOut();redirect("/login")}return{db:createLocalServerClient(user.id),user,profile:user,configured:true}}
