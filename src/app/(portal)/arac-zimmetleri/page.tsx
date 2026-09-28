import {VehicleAssignmentsList} from "@/components/vehicle-assignments-list";
export const dynamic="force-dynamic";
export default async function Assignments({searchParams}:{searchParams:Promise<{q?:string;tab?:string}>}){
  const sp=await searchParams;
  const tab=sp.tab==="history"?"history":"active";
  return <VehicleAssignmentsList tab={tab} qValue={sp.q}/>;
}
