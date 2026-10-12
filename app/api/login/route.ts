import { NextResponse } from 'next/server';
import { COOKIE,makeSession,sessionOptions,validPin } from '@/lib/auth';
export const dynamic='force-dynamic';
export async function POST(req:Request) {
  let pin:unknown;
  try{pin=(await req.json()).pin;}catch{return NextResponse.json({error:'PIN inválido.'},{status:400});}
  if(!validPin(pin))return NextResponse.json({error:'PIN incorreto.'},{status:401});
  try{
    const r=NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
    r.cookies.set(COOKIE,makeSession(),sessionOptions());return r;
  }catch{return NextResponse.json({error:'Configure LAB_SESSION_SECRET na Vercel.'},{status:503});}
}
