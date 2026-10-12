import type { Catalog } from './catalog';
import type { VerifiedCart } from './cart';
export type Fulfillment='delivery'|'pickup'|null;
export type Payment='pix'|'cash'|'debit'|'credit'|null;
export type Draft={
  name:string;phone:string;fulfillment:Fulfillment;city:string;neighborhood:string;street:string;number:string;
  complement:string;paymentMethod:Payment;changeFor:number|null;requestedWhen:string;notes:string;
  upsellStatus:'pending'|'offered'|'declined'|'accepted'
};
export type Quote={readyForSimulation:boolean;issues:string[];warnings:string[];deliveryFee:number|null;total:number|null;minimumOrder:number;storeOpen:boolean;};
export const EMPTY_DRAFT:Draft={name:'',phone:'',fulfillment:null,city:'',neighborhood:'',street:'',number:'',complement:'',paymentMethod:null,changeFor:null,requestedWhen:'',notes:'',upsellStatus:'pending'};
const textKeys=['name','phone','city','neighborhood','street','number','complement','requestedWhen','notes'] as const;
export function sanitizeDraft(input:unknown,previous:Draft=EMPTY_DRAFT):Draft {
  const draft:Draft={...EMPTY_DRAFT,...previous};
  if(!input||typeof input!=='object'||Array.isArray(input))return draft;
  const obj=input as Record<string,unknown>;
  for(const key of textKeys){
    if(Object.prototype.hasOwnProperty.call(obj,key)&&(typeof obj[key]==='string'||obj[key]===null)){
      draft[key]=typeof obj[key]==='string'?obj[key].trim().slice(0,key==='notes'?500:160):'';
    }
  }
  if(Object.prototype.hasOwnProperty.call(obj,'fulfillment')&&(obj.fulfillment===null||obj.fulfillment==='delivery'||obj.fulfillment==='pickup'))draft.fulfillment=obj.fulfillment;
  if(Object.prototype.hasOwnProperty.call(obj,'paymentMethod')&&(obj.paymentMethod===null||['pix','cash','debit','credit'].includes(String(obj.paymentMethod))))draft.paymentMethod=obj.paymentMethod as Payment;
  if(Object.prototype.hasOwnProperty.call(obj,'changeFor')) {
    const n=obj.changeFor;
    draft.changeFor=typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100000?n:null;
  }
  if(['pending','offered','declined','accepted'].includes(String(obj.upsellStatus)))draft.upsellStatus=obj.upsellStatus as Draft['upsellStatus'];
  return draft;
}
function key(v:unknown){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');}
function money(v:number){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);}
type BusinessHour={day:number;enabled:boolean;open:string;close:string};
function safeTime(s:unknown):number|null {
  if(typeof s!=='string'||!/^\d{1,2}:\d{2}$/.test(s))return null;
  const [h,m]=s.split(':').map(Number);
  return h<=23&&m<=59?h*60+m:null;
}
export function isStoreOpen(settings:Record<string,unknown>,at:Date=new Date()):boolean {
  if(settings.is_open!==true)return false;
  const hours=settings.business_hours;
  let schedule:BusinessHour[]=[];
  try{const parsed=typeof hours==='string'?JSON.parse(hours):hours;if(Array.isArray(parsed))schedule=parsed;}catch{}
  // Absent schedule is NOT proof the shop is open: keep the manual flag but
  // prevent autonomous availability promises.
  if(!schedule.length)return false;
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at);
  const weekdays=['sun','mon','tue','wed','thu','fri','sat'];
  const day=weekdays.indexOf((parts.find(p=>p.type==='weekday')?.value||'sun').toLowerCase().slice(0,3));
  const minute=Number(parts.find(p=>p.type==='hour')?.value||0)*60+Number(parts.find(p=>p.type==='minute')?.value||0);
  const active=(record:BusinessHour|undefined,previous:boolean)=>{
    if(!record?.enabled)return false;
    const open=safeTime(record.open),close=safeTime(record.close);
    if(open===null||close===null)return false;
    if(open===close)return !previous;
    if(open<close)return !previous&&minute>=open&&minute<close;
    return previous?minute<close:minute>=open;
  };
  return active(schedule.find(h=>Number(h.day)===day),false)||active(schedule.find(h=>Number(h.day)===(day+6)%7),true);
}
export function inferCityFromZones(draft:Draft,catalog:Catalog):Draft {
  if(draft.fulfillment!=='delivery'||draft.city||!draft.neighborhood)return draft;
  const same=catalog.zones.filter(zone=>key(zone.neighborhood)===key(draft.neighborhood));
  const cities=[...new Map(same.filter(z=>z.city).map(z=>[key(z.city),String(z.city)])).values()];
  if(cities.length!==1)return draft; // Do not guess if the neighborhood exists in both cities.
  return {...draft,city:cities[0]};
}
export function quoteOrder(cart:VerifiedCart,draft:Draft,catalog:Catalog,opts:{requirePhone?:boolean}={}):Quote {
  const issues:string[]=[],warnings:string[]=[];
  const settings=catalog.settings;
  const open=isStoreOpen(settings);
  if(!cart.valid)issues.push(...cart.problems);
  if(cart.cart.length===0)issues.push('Escolher pelo menos um produto do cardápio.');
  if(draft.name.trim().length<2)issues.push('Informar o nome.');
  if(opts.requirePhone!==false&&!/^\d{10,13}$/.test(draft.phone.replace(/\D/g,'')))issues.push('Informar o WhatsApp com DDD.');
  if(!draft.fulfillment)issues.push('Escolher entrega ou retirada.');
  if(draft.fulfillment&&settings[draft.fulfillment==='delivery'?'accept_delivery':'accept_pickup']!==true)issues.push(draft.fulfillment==='delivery'?'Entrega indisponível.':'Retirada indisponível.');
  const min=Number(draft.fulfillment==='delivery'?(settings.minimum_order_delivery??settings.minimum_order??0):(settings.minimum_order_pickup??0));
  const minimumOrder=Number.isFinite(min)&&min>0?min:0;
  if(cart.subtotal<minimumOrder)issues.push('Pedido mínimo de '+money(minimumOrder)+' em produtos.');
  let fee:number|null=draft.fulfillment==='pickup'?0:null;
  if(draft.fulfillment==='delivery'){
    if(!draft.city||!draft.neighborhood)issues.push('Informar cidade e bairro da entrega.');
    else{
      const zones=catalog.zones.filter(z=>key(z.city)===key(draft.city)&&key(z.neighborhood)===key(draft.neighborhood));
      if(zones.length!==1)issues.push('Confirmar disponibilidade e taxa para esse bairro com a equipe.');
      else if(Number.isFinite(zones[0].fee)&&zones[0].fee>=0)fee=zones[0].fee;
      else issues.push('Taxa de entrega indisponível.');
    }
    if(!draft.street||!draft.number)issues.push('Informar rua e número.');
  }
  if(!draft.paymentMethod)issues.push('Escolher a forma de pagamento.');
  else if(settings[({pix:'accept_pix',cash:'accept_cash',debit:'accept_debit',credit:'accept_credit'} as const)[draft.paymentMethod]]!==true)
    issues.push('Forma de pagamento indisponível.');
  const total=fee===null?null:Math.round((cart.subtotal+fee)*100)/100;
  if(draft.paymentMethod==='cash'&&draft.changeFor!==null&&total!==null&&draft.changeFor<=total)issues.push('Troco deve ser para um valor maior que '+money(total)+'.');
  if(!open)warnings.push('Não confirmar pedido imediato: estabelecimento fora do horário ou disponibilidade não confirmada.');
  if(draft.requestedWhen)warnings.push('Data e horário de encomenda dependem de confirmação humana; não reservar automaticamente.');
  if(draft.paymentMethod==='pix')warnings.push('Pix apenas simulado: sem QR Code, sem comprovante validado e sem confirmação de pagamento.');
  if(opts.requirePhone===false&&!draft.phone)warnings.push('O laboratório não conhece o telefone de origem. A integração real deve capturá-lo do evento oficial do WhatsApp.');
  warnings.push('Este laboratório nunca registra pedidos reais no PedidoPro.');
  return {readyForSimulation:issues.length===0,issues,warnings,deliveryFee:fee,total,minimumOrder,storeOpen:open};
}
