import {NextRequest} from 'next/server';
import {exportSheet,importSheet} from '@/lib/import-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(req:NextRequest)=>exportSheet(req,'compliance');
export const POST=(req:NextRequest)=>importSheet(req,'compliance');
