'use client';
import { useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
export default function PinGate(){
 const [pin,setPin]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 async function enter(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{
   const res=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin})});
   const data=await res.json();if(!res.ok)throw new Error(data.error||'Falha no acesso.');
   window.location.reload();
 }catch(e){setError(e instanceof Error?e.message:'Não foi possível entrar.');setBusy(false);}}
 return <main className="gate">
   <section className="gate-card">
    <div className="gate-mark">K<span>!</span></div>
    <p className="eyebrow">VENDRA · LABORATÓRIO</p>
    <h1>Ki Delícia Salgados</h1>
    <p className="gate-desc">Entre para testar o atendimento como se estivesse conversando pelo WhatsApp.</p>
    <form onSubmit={enter}><label htmlFor="pin">PIN DE ACESSO</label><div className="pin-box"><LockKeyhole size={19}/><input id="pin" type="password" inputMode="numeric" autoComplete="off" placeholder="Digite o PIN" minLength={4} maxLength={12} pattern="[0-9]*" value={pin} onChange={e=>setPin(e.target.value)} required /></div>
    {error&&<p className="error" role="alert">{error}</p>}
    <button type="submit" disabled={busy} className="gate-button">{busy?'Verificando…':'Entrar no laboratório'}<ArrowRight size={19}/></button></form>
    <small>Área de testes · Nenhum pedido ou pagamento será realizado</small>
   </section>
 </main>;
}
