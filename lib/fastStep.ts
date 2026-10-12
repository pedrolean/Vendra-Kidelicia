import type { Catalog } from './catalog';
import type { Draft } from './checkout';
import {inferCityFromZones,quoteOrder} from './checkout.ts';
import {enrichAddressFromMessage} from './addressIntent.ts';
import {validateCart,type VerifiedCart} from './cart.ts';
import {isCartEditMessage} from './cartIntent.ts';
import {safeCheckoutReply} from './checkoutDialogue.ts';
import {availableUpsellOptions,isUpsellDecline,isVagueUpsellYes,makeUpsellText,upsellOptions} from './upsell.ts';

function normalized(message:string) {
 return message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function exactFulfillment(message:string):Draft['fulfillment']|null{
 const m=normalized(message);
 if(/^(entrega|delivery|para entregar|quero entrega|pode entregar|entregar|vai ser entrega)$/.test(m))return 'delivery';
 if(/^(retirada|retirar|buscar|vou buscar|vou retirar|para retirar|quero retirada|vou ai buscar|passo ai)$/.test(m))return 'pickup';
 return null;
}
function exactPayment(message:string):Draft['paymentMethod']|null{
 const m=normalized(message);
 if(/^(pix|no pix|via pix|vou pagar no pix|pagamento pix)$/.test(m))return 'pix';
 if(/^(dinheiro|em dinheiro|vou pagar em dinheiro|pagar em dinheiro|cash)$/.test(m))return 'cash';
 if(/^(debito|cartao de debito|no debito|pagar no debito)$/.test(m))return 'debit';
 if(/^(credito|cartao de credito|no credito|pagar no credito)$/.test(m))return 'credit';
 return null;
}
function nameWhenAsked(message:string,lastReply:string){
 if(!/qual (e|seria) (o )?seu nome|seu nome|nome para (o )?pedido/i.test(normalized(lastReply)))return null;
 const m=message.trim().match(/^(?:meu nome e|me chamo|pode colocar em nome de|sou o|sou a)?\s*([\p{L}][\p{L}\s'-]{1,65})[.!]?$/iu);
 if(!m || /\b(quero|entrega|retirada|pix|dinheiro|salgado|churros|refri|obrigad|rua|avenida)\b/i.test(normalized(m[1])))return null;
 return m[1].trim();
}
function itemSelection(message:string,cart:VerifiedCart,catalog:Catalog){
 const selections=availableUpsellOptions(cart,catalog);
 const t=normalized(message);
 const exact=selections.filter(p=>t.includes(normalized(p.name)));
 const candidates=(exact.length===1?exact:selections.filter(p=>{
   const name=normalized(p.name);
   // Prefer explicit product/brand, not a generic "quero o refri" guess.
   const key=p.kind==='dessert'?'churros':/coca cola/.test(name)?'coca':/guarana/.test(name)?'guarana':/pepsi/.test(name)?'pepsi':/fanta/.test(name)?'fanta':'';
   return (key&&new RegExp('\\b'+key+'\\b').test(t))||
     (name.length>=5&&t.includes(name));
 }));
 if(candidates.length>1){
   return {ask:'Tenho estas opções:\n'+candidates.map(o=>'• '+o.name+' — '+
     new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(o.price)).join('\n')+
     '\nQual você prefere?'} as const;
 }
 if(candidates.length!==1)return null;
 const candidate=candidates[0];
 if(candidate.needsChoice)return {ask:'Esse item tem opções de escolha. Qual sabor ou configuração você prefere?'} as const;
 const item={productId:candidate.id,quantity:1,extras:[]};
 const next=validateCart([...cart.cart,item],catalog);
 if(!next.valid)return null;
 return {cart:next} as const;
}
export type FastStep={reply:string;draft:Draft;cart:VerifiedCart};

/** High-confidence short checkout turns bypass the LLM completely.
    Does not rewrite a confirmed salgado cart. */
export function handleFastStep(args:{
 message:string;lastAssistant:string;draft:Draft;cart:VerifiedCart;catalog:Catalog;explicitCity?:boolean
}):FastStep|null{
 const {message,lastAssistant,catalog}=args;
 if(!args.cart.valid||!args.cart.cart.length)return null;
 const raw=normalized(message);
 if(!raw)return null;
 let cart=args.cart,draft={...args.draft};
 const offered=draft.upsellStatus==='offered';
 if(offered&&isVagueUpsellYes(message)){
   const options=upsellOptions(cart,catalog);
   const offer=makeUpsellText(options);
   return {cart,draft,reply:offer||'Qual produto você gostaria de acrescentar?'};
 }
 if(offered&&isUpsellDecline(message))draft.upsellStatus='declined';
 else if(offered){
   const selected=itemSelection(message,cart,catalog);
   if(selected&&'ask'in selected)return {cart,draft,reply:selected.ask};
   if(selected&&'cart'in selected){cart=selected.cart;draft.upsellStatus='accepted';}
 }
 const productIntent=isCartEditMessage(message,catalog);
 // Other product edits go to model; guard its output deterministically.
 if(productIntent&&cart===args.cart)return null;
 const fulfillment=exactFulfillment(message);
 const payment=exactPayment(message);
 const name=nameWhenAsked(message,lastAssistant);
 if(fulfillment)draft.fulfillment=fulfillment;
 if(payment)draft.paymentMethod=payment;
 if(name)draft.name=name;
 if(draft.fulfillment==='delivery'){
   draft=enrichAddressFromMessage(message,args.draft,draft,catalog,args.explicitCity||false);
 }
 const troco=raw.match(/\b(?:troco|trocar)\s+(?:para|pra)\s+(?:r\s*)?(\d{1,6})(?:[,.](\d\d))?\b/);
 if(troco&&draft.paymentMethod==='cash')draft.changeFor=Number(troco[1])+Number(troco[2]||0)/100;
 const changed=JSON.stringify(draft)!==JSON.stringify(args.draft)||cart!==args.cart;
 const requestInfo=/^(agora|ja|para hoje|pra hoje|total|resumo|quanto fica|quanto deu|finalizar|fechar|concluir|pode fechar|confirmar)$/.test(raw);
 if(!changed&&!requestInfo)return null;
 let quote=quoteOrder(cart,draft,catalog,{requirePhone:false});
 if(draft.upsellStatus==='pending'&&draft.paymentMethod&&cart.cart.length &&
    quote.issues.every(issue=>issue==='Informar o nome.')){
   draft.upsellStatus=upsellOptions(cart,catalog).length?'offered':'declined';
   quote=quoteOrder(cart,draft,catalog,{requirePhone:false});
 }
 const reply=safeCheckoutReply({
   text:message,previous:args.draft,draft,cart,quote,catalog
 });
 if(reply)return {reply,draft,cart};
 if(name)return {reply:'Obrigada! Agora vou conferir o resumo do seu pedido de teste.',draft,cart};
 return null;
}
