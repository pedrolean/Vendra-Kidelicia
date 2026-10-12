import 'server-only';
import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'vendra_kd_lab_auth';
const MAX_AGE = 60 * 60 * 8;
const secret = () => process.env.LAB_SESSION_SECRET || '';
const hash = (value:string) => createHmac('sha256', secret()).update(value).digest('hex');
export function validPin(value:unknown):boolean {
  const pin = process.env.LAB_ACCESS_PIN || '';
  if(typeof value !== 'string' || !/^\d{4,12}$/.test(value) || !/^\d{4,12}$/.test(pin))return false;
  const actual=Buffer.from(value);const expected=Buffer.from(pin);
  return actual.length===expected.length && timingSafeEqual(actual,expected);
}
export function makeSession() {
  if(secret().length < 32)throw new Error('LAB_SESSION_SECRET requer 32 caracteres ou mais.');
  const expires=String(Math.floor(Date.now()/1000)+MAX_AGE);
  return expires+'.'+hash(expires);
}
export async function isAuthenticated():Promise<boolean> {
  if(secret().length<32)return false;
  const value=(await cookies()).get(COOKIE)?.value || '';
  const parts=value.split('.');
  if(parts.length!==2 || !/^\d+$/.test(parts[0]) || !/^[a-f0-9]{64}$/.test(parts[1]))return false;
  const a=Buffer.from(parts[1],'hex'),b=Buffer.from(hash(parts[0]),'hex');
  return a.length===b.length && timingSafeEqual(a,b) && Number(parts[0])>Math.floor(Date.now()/1000);
}
export function sessionOptions(){return {httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict' as const,path:'/',maxAge:MAX_AGE};}
export {COOKIE};
