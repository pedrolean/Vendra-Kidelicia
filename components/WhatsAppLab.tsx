'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, CheckCheck, ImagePlus, LoaderCircle, LogOut, Mic, RotateCcw, Send, Square, X } from 'lucide-react';
type Message={id:string;role:'assistant'|'user';content:string;at:string;image?:string};
type Line={productId:string;quantity:number;extras:{extraId:string;quantity:number}[];notes?:string};
type Result={reply?:string;cart?:Line[];subtotal?:number;error?:string};
const STORAGE='vendra_kidelicia_whatsapp_v2';
const greeting:Message={id:'welcome',role:'assistant',content:'Oi! 😊 Seja bem-vindo(a) à Ki Delícia Salgados! Como posso te ajudar hoje?',at:'agora'};
const suggestions=['Quero 50 salgados para festa 🎉','Quais sabores vocês têm?','Vocês entregam na minha região?'];
function uid(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);}
function currentTime(){return new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
function money(v:number){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);}
export default function WhatsAppLab(){
 const [messages,setMessages]=useState<Message[]>([greeting]);
 const [cart,setCart]=useState<Line[]>([]);
 const [subtotal,setSubtotal]=useState(0);
 const [input,setInput]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [photo,setPhoto]=useState<string|null>(null);
 const [recording,setRecording]=useState(false);
 const [transcribing,setTranscribing]=useState(false);
 const [ready,setReady]=useState(false);
 const photoRef=useRef<HTMLInputElement>(null);
 const bottom=useRef<HTMLDivElement>(null);
 const media=useRef<MediaRecorder|null>(null);
 const chunks=useRef<Blob[]>([]);
 const abortRef=useRef<AbortController|null>(null);
 const flowRef=useRef(0);
 useEffect(()=>{
   try {
     const raw=localStorage.getItem(STORAGE);
     if(raw){const saved=JSON.parse(raw);
       if(Array.isArray(saved.messages)&&saved.messages.length)setMessages(saved.messages.slice(-40).filter((m:Message)=>m&&['assistant','user'].includes(m.role)&&typeof m.content==='string'));
       if(Array.isArray(saved.cart))setCart(saved.cart.slice(0,25));
       if(typeof saved.subtotal==='number')setSubtotal(saved.subtotal);
     }
   }catch{}
   setReady(true);
 },[]);
 useEffect(()=>{if(!ready)return;
   try{localStorage.setItem(STORAGE,JSON.stringify({messages:messages.slice(-40).map(m=>({...m,image:undefined})),cart,subtotal}));}catch{}
 },[messages,cart,subtotal,ready]);
 useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth',block:'end'});},[messages,busy,error]);
 async function send(override?:string){
   const text=(override??input).trim();
   if(busy||(!text&&!photo))return;
   const user:Message={id:uid(),role:'user',content:text||(photo?'Enviei uma foto.':'Mensagem'),at:currentTime(),image:photo||undefined};
   const next=[...messages,user];
   const attachment=photo;
   setMessages(next);setInput('');setPhoto(null);setError('');setBusy(true);
   const controller=new AbortController();abortRef.current=controller;
   try{
     const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:next.map(m=>({role:m.role,content:m.content})),cart,image:attachment}),signal:controller.signal});
     const result:Result=await response.json();
     if(response.status===401){window.location.reload();return;}
     if(!response.ok)throw new Error(result.error||'Falha ao enviar sua mensagem.');
     if(controller.signal.aborted)return;
     if(Array.isArray(result.cart))setCart(result.cart);
     if(typeof result.subtotal==='number')setSubtotal(result.subtotal);
     setMessages(old=>[...old,{id:uid(),role:'assistant',content:result.reply||'Você pode me contar mais sobre o que procura?',at:currentTime()}]);
   }catch(e){if(controller.signal.aborted)return;
     setError(e instanceof Error?e.message:'Não foi possível enviar. Tente novamente.');
   }finally{if(abortRef.current===controller){abortRef.current=null;setBusy(false);}}
 }
 function reset(){
   flowRef.current++;
   abortRef.current?.abort();abortRef.current=null;
   if(media.current?.state==='recording')media.current.stop();
   setRecording(false);setBusy(false);setTranscribing(false);
   setMessages([{...greeting,id:uid()}]);setCart([]);setSubtotal(0);setInput('');setPhoto(null);setError('');
   try{localStorage.removeItem(STORAGE);}catch{}
 }
 async function logout(){await fetch('/api/logout',{method:'POST'});window.location.reload();}
 function choosePhoto(file?:File){
   if(!file)return;
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>1_900_000){setError('Envie uma foto JPG, PNG ou WEBP de até 1,9 MB.');return;}
   const reader=new FileReader();reader.onload=()=>{setPhoto(String(reader.result));setError('');};reader.readAsDataURL(file);
 }
 async function toggleAudio(){
   if(recording){media.current?.stop();setRecording(false);return;}
   if(busy||transcribing)return;
   const startingFlow=flowRef.current;
   try{
     if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('Este navegador não permite gravação de áudio.');
     const stream=await navigator.mediaDevices.getUserMedia({audio:true});
     if(flowRef.current!==startingFlow){stream.getTracks().forEach(t=>t.stop());return;}
     const recorder=new MediaRecorder(stream);
     media.current=recorder;chunks.current=[];
     recorder.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data);};
     const recorderFlow=flowRef.current;
     recorder.onstop=async()=>{
       stream.getTracks().forEach(t=>t.stop());
       if(flowRef.current!==recorderFlow)return;
       const type=recorder.mimeType||'audio/webm';
       const blob=new Blob(chunks.current,{type});
       chunks.current=[];setRecording(false);
       if(!blob.size)return;
       if(blob.size>3_000_000){setError('O áudio passou de 3 MB. Grave uma mensagem menor.');return;}
       setTranscribing(true);setError('');
       try{
         const form=new FormData();form.append('audio',new File([blob],type.includes('mp4')?'mensagem.mp4':'mensagem.webm',{type}));
         const r=await fetch('/api/audio',{method:'POST',body:form});
         const data=await r.json();if(flowRef.current!==recorderFlow)return;if(!r.ok)throw new Error(data.error||'Falha no áudio.');
         const transcript=String(data.text||'').trim();
         if(!transcript)throw new Error('Não reconheci o áudio. Tente novamente.');
         setInput(transcript);
       }catch(e){if(flowRef.current===recorderFlow)setError(e instanceof Error?e.message:'Não foi possível transcrever.');}
       finally{if(flowRef.current===recorderFlow)setTranscribing(false);}
     };
     recorder.start(300);setRecording(true);
   }catch(e){setError(e instanceof Error?e.message:'Não foi possível acessar o microfone.');setRecording(false);}
 }
 return <main className="lab-shell">
   <section className="wa-window" aria-label="Simulador de WhatsApp Ki Delícia">
     <header className="wa-header">
       <div className="wa-avatar">K<span>!</span></div>
       <div className="wa-contact"><strong>Ki Delícia Salgados</strong><small><span className="status-dot"/> atendimento · laboratório de teste</small></div>
       <button className="header-action" onClick={reset} title="Reiniciar conversa" aria-label="Reiniciar conversa"><RotateCcw size={20}/></button>
       <button className="header-action exit" onClick={logout} title="Sair" aria-label="Sair"><LogOut size={19}/></button>
     </header>
     <div className="wa-chat">
       <div className="wa-disclaimer">AMBIENTE DE TESTES · Nenhum pedido será registrado</div>
       <div className="wa-date">Hoje</div>
       {messages.map(m=><div key={m.id} className={'wa-row '+(m.role==='user'?'out':'in')}>
         <article className={'wa-bubble '+(m.role==='user'?'out':'in')}>
           {m.image&&<img className="wa-photo" src={m.image} alt="Foto enviada"/>}
           <p>{m.content}</p>
           <span className="wa-time">{m.at}{m.role==='user'&&<CheckCheck size={15}/>}</span>
         </article>
       </div>)}
       {busy&&<div className="wa-row in"><div className="wa-bubble wa-typing"><i/><i/><i/></div></div>}
       {messages.length===1&&!busy&&<div className="wa-suggestions">{suggestions.map(s=><button key={s} onClick={()=>send(s)}>{s}</button>)}</div>}
       <div ref={bottom}/>
     </div>
     <div className="wa-footer">
       {subtotal>0&&<div className="wa-summary">🛍️ Pedido simulado: {cart.length} item(ns) · <strong>{money(subtotal)}</strong> <span>Não enviado</span></div>}
       {error&&<div className="wa-error" role="alert">{error}<button onClick={()=>setError('')} aria-label="Dispensar aviso"><X size={15}/></button></div>}
       {photo&&<div className="wa-attachment"><img src={photo} alt="Prévia da foto"/><span>Foto pronta para enviar</span><button onClick={()=>setPhoto(null)} aria-label="Remover imagem"><X size={18}/></button></div>}
       <div className="wa-composer">
         <button type="button" className="wa-tool" aria-label="Anexar foto" title="Anexar foto" disabled={busy||recording} onClick={()=>photoRef.current?.click()}><ImagePlus size={22}/></button>
         <input ref={photoRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{choosePhoto(e.target.files?.[0]);e.target.value='';}}/>
         <textarea rows={1} value={input} disabled={busy||recording||transcribing} onChange={e=>setInput(e.target.value)} placeholder={transcribing?'Transcrevendo áudio…':recording?'Gravando áudio…':'Mensagem'} aria-label="Digite sua mensagem" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}}/>
         {!input.trim()&&!photo?
           <button className={'wa-send '+(recording?'is-recording':'')} type="button" disabled={busy||transcribing} onClick={toggleAudio} aria-label={recording?'Parar gravação':'Gravar áudio'}>{recording?<Square size={20}/>:transcribing?<LoaderCircle size={20} className="spin"/>:<Mic size={21}/>}</button>:
           <button className="wa-send" type="button" disabled={busy} onClick={()=>send()} aria-label="Enviar mensagem">{busy?<LoaderCircle size={20} className="spin"/>:<Send size={19}/>}</button>}
       </div>
       <p className="wa-bottom-label">Vendra × PedidoPro · Simulação, sem WhatsApp real</p>
     </div>
   </section>
 </main>;
}
