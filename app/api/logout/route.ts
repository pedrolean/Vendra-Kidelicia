import { NextResponse } from 'next/server';
import { COOKIE } from '@/lib/auth';
export async function POST(){
 const r=NextResponse.json({ok:true});r.cookies.set(COOKIE,'',{path:'/',httpOnly:true,maxAge:0});return r;
}
