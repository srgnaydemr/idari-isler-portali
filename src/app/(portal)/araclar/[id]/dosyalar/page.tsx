import VehicleDetail from "../page";

export default async function VehicleDetailFilesRoute({params,searchParams}:{params:Promise<{id:string}> ;searchParams:Promise<Record<string,string|undefined>>}){
  const sp=await searchParams;
  return VehicleDetail({params,searchParams:Promise.resolve({...sp,tab:"files"})});
}
