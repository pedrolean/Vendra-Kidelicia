import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  if(!await isAuthenticated())return NextResponse.json({error:'Faça login novamente.'},{status:401});
  if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:'Falta OPENAI_API_KEY.'},{status:503});
  let audio:FormDataEntryValue|null=null;
  try{audio=(await request.formData()).get('audio');}catch{return NextResponse.json({error:'Áudio inválido.'},{status:400});}
  if(!(audio instanceof File)||audio.size<1||audio.size>3_000_000||!audio.type.startsWith('audio/'))return NextResponse.json({error:'Grave um áudio de até 3 MB.'},{status:400});
  const form=new FormData();form.set('file',audio,audio.name||'mensagem.webm');form.set('model','whisper-1');form.set('language','pt');
  try{
    const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY},body:form,cache:'no-store',signal:AbortSignal.timeout(50000)});
    if(!response.ok)return NextResponse.json({error:'Não consegui transcrever o áudio.'},{status:502});
    const result=await response.json();
    return NextResponse.json({text:String(result.text||'').slice(0,2000)},{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({error:'Falha na transcrição.'},{status:502});}
}
