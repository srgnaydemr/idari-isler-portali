import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
export default async function AssignmentRedirect({params}:{params:Promise<{id:string}>}){
  const {id}=await params; const {db}=await requireUser(); if(!db) notFound();
  const {data}=await db.from("vehicle_assignments").select("vehicle_id").eq("id",id).maybeSingle();
  if(!data) notFound(); redirect(`/araclar/${data.vehicle_id}/zimmet`);
}
