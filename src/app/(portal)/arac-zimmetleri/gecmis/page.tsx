import {VehicleAssignmentsList} from "@/components/vehicle-assignments-list";
export const dynamic="force-dynamic";
export default async function AssignmentHistory({searchParams}:{searchParams:Promise<{q?:string}>}){
  const sp=await searchParams;
  return <VehicleAssignmentsList tab="history" qValue={sp.q}/>;
}
