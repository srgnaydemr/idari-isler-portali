import PersonnelAssets from "../page";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){const sp=await searchParams;return PersonnelAssets({searchParams:Promise.resolve({...sp,tab:"history"})});}
