"use server";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {vehicleSchema,odometerSchema} from "@/lib/validation";
import {requireUser} from "@/lib/auth";
import {getDatabase} from "@/lib/local/database";
import {syncVehicleRentalContract} from "@/lib/rental-contract-store";

export type ActionState={error?:string;success?:string};

export async function createVehicleAction(_:ActionState,fd:FormData):Promise<ActionState>{
  const {db,user}=await requireUser(),p=vehicleSchema.safeParse(Object.fromEntries(fd.entries()));
  if(!p.success)return{error:p.error.issues[0]?.message||"Form bilgileri geçersiz."};
  const v=p.data;
  if(v.ownership_type==="FLEET"){
    // Sözleşme alanları araç eklemeyi engellemez.
    const hasKm=v.contract_km_limit!==undefined&&v.contract_km_limit!=="";
    if(v.contract_start_date&&v.contract_end_date&&v.contract_end_date<=v.contract_start_date)return{error:"Sözleşme bitiş tarihi başlangıç tarihinden sonra olmalıdır."};
    if(hasKm&&Number(v.contract_km_limit)<=0)return{error:"Sözleşme KM limiti 0'dan büyük olmalıdır."};
  }
  const payload={...v,created_by:user.id,updated_by:user.id,vin:v.vin||null,registration_serial_no:v.registration_serial_no||null,registration_date:v.registration_date||null,responsible_person:v.responsible_person||null,contract_start_date:v.ownership_type==="FLEET"?(v.contract_start_date||null):null,contract_end_date:v.ownership_type==="FLEET"?(v.contract_end_date||null):null,contract_km_limit:v.ownership_type==="FLEET"?(v.contract_km_limit===""?null:v.contract_km_limit):null,contract_reference:v.ownership_type==="FLEET"?(v.contract_reference||null):null,planned_return_date:v.ownership_type==="FLEET"?(v.planned_return_date||null):null,fleet_description:v.ownership_type==="FLEET"?(v.fleet_description||null):null,fleet_company:v.ownership_type==="FLEET"?v.fleet_company:null};
  const r=await db.from("vehicles").insert(payload).select("id").single();
  if(r.error)return{error:r.error.code==="23505"?"Bu plaka veya şasi numarası ile kayıtlı araç zaten bulunuyor.":"Araç kaydedilemedi."};
  try{syncVehicleRentalContract(getDatabase(),String(r.data.id),user.id)}catch(e:any){return{error:String(e?.message||"Sözleşme bilgileri kaydedilemedi.")}};
  revalidatePath("/araclar");redirect(`/araclar/${r.data.id}`)
}

export async function updateOdometerAction(_:ActionState,fd:FormData):Promise<ActionState>{
  const{db}=await requireUser(),p=odometerSchema.safeParse(Object.fromEntries(fd.entries()));
  if(!p.success)return{error:p.error.issues[0]?.message||"KM bilgisi geçersiz."};
  const r=await db.rpc("update_vehicle_odometer",{p_vehicle_id:p.data.vehicle_id,p_new_odometer:p.data.new_odometer,p_description:p.data.description||null,p_correction_reason:p.data.correction_reason||null});
  if(r.error)return{error:r.error.message.includes("LOWER_ODOMETER_REQUIRES_REASON")?"Yeni KM mevcut KM'den düşükse düzeltme açıklaması zorunludur.":"KM güncellenemedi."};
  revalidatePath(`/araclar/${p.data.vehicle_id}`);return{success:`KM ${r.data} olarak güncellendi.`}
}
