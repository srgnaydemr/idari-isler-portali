/**
 * Tüm araç durum güncellemeleri tek merkezi servis üzerinden yapılır.
 * Bu ince adaptör Supabase-benzeri istemcinin yalnızca ortak RPC'yi çağırmasını sağlar;
 * durum öncelik mantığı burada tekrar edilmez.
 */
export async function reconcileVehicleStatus(db:any,vehicleId:string,userId:string){
  const {data,error}=await db.rpc("reconcile_vehicle_status",{p_vehicle_id:vehicleId,p_description:"Araç aktif durumu merkezi olarak eşitlendi"});
  if(error) throw new Error(error.message||"Araç durumu ilgili operasyonlarla eşitlenemedi.");
  return data;
}
