import type { Catalog, Product, Group } from './catalog';
import type { CartLine } from './cart';

type Message={role:'user'|'assistant';content:string};
export type FlavorResolution={
  cart:CartLine[];
  reply:string;
  selected:{name:string;quantity:number}[];
};

function normalize(text:string){
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function has(text:string,phrase:string){
  return (' '+normalize(text)+' ').includes(' '+normalize(phrase)+' ');
}
function kitUnits(product:Product){
  const match=normalize(product.name).match(/\bsalgados?\s+(\d+)\s+unidades?\b/);
  return match?Number(match[1]):null;
}
function requestedUnits(text:string){
  const t=normalize(text);
  const match=t.match(/\b(\d+)\s+(?:unidades?\s+de\s+)?salgados?\b/)||
    t.match(/\bsalgados?\s+(\d+)\s+unidades?\b/);
  return match?Number(match[1]):null;
}
function flavorGroup(product:Product){
  const groups=product.group.filter(g=>has(g.name,'sabores dos salgados'));
  return groups.length===1?groups[0]:null;
}
function isExcluded(text:string,name:string){
  const t=' '+normalize(text)+' ';
  const target=normalize(name);
  const starters=['menos','menos o','menos a','menos o de','menos a de','sem','sem o',
    'sem a','sem o de','exceto','tira','tirar','retira','retirar','nao quero'];
  return starters.some(start=>t.includes(' '+start+' '+target+' '));
}
function mentionedOptions(text:string,group:Group){
  const present=group.options.filter(o=>has(text,o.name));
  return present.filter(option=>!present.some(other=>other.id!==option.id &&
    normalize(other.name).includes(normalize(option.name)) && has(text,other.name)));
}
function flavorMessage(text:string){
  return /\b(misto|misturado|mistura|todos|sabores|menos|exceto|sem|tira|retira)\b/.test(normalize(text));
}
function response(units:number,selected:{name:string;quantity:number}[],omissions:string[],uneven:boolean){
  const list=selected.map(item=>item.quantity+' de '+item.name.toLowerCase());
  const description=list.length===1?list[0]:list.slice(0,-1).join(', ')+' e '+list[list.length-1];
  const excluded=omissions.length?' Sem '+omissions.map(x=>x.toLowerCase()).join(', ')+'.':'';
  const question=uneven?' Distribuí da forma mais equilibrada possível. Pode ser assim?':' Você prefere entrega ou retirada?';
  return 'Perfeito! Ficaram '+units+' salgados: '+description+'.'+excluded+question;
}

/**
 * Conservatively resolves explicitly mixed salgado kits from natural dialogue.
 * Product IDs, option IDs and flavors come exclusively from the live catalogue.
 * The caller MUST run validateCart before accepting the computed cart.
 */
export function resolveMixedFlavorIntent(messages:Message[],catalog:Catalog,currentCart:CartLine[]):FlavorResolution|null{
  const users=messages.map((message,index)=>({...message,index})).filter(m=>m.role==='user');
  if(!users.length)return null;
  const latest=users[users.length-1];
  const requests=users.filter(m=>requestedUnits(m.content)!==null);
  if(!requests.length)return null;
  const request=requests[requests.length-1];
  const units=requestedUnits(request.content);
  const matching=catalog.products.filter(p=>kitUnits(p)===units && flavorGroup(p));
  if(matching.length!==1||!units)return null; // Never guess between multiple similarly named kits.
  const product=matching[0],group=flavorGroup(product)!;
  if(!group.options.length)return null;

  const current=latest.content;
  const explicit=mentionedOptions(current,group);
  const relevant=explicit.length>=2||flavorMessage(current);
  if(!relevant)return null; // Greetings and other product requests must not replay the mixed order.
  const context=users.filter(m=>m.index>=request.index);
  const alreadyMixed=context.some(m=>/\b(misto|misturado|mistura|todos)\b/.test(normalize(m.content)));

  const excludedIds=new Set<string>();
  const omissions:string[]=[];
  for(const message of context){
    for(const option of group.options){
      if(isExcluded(message.content,option.name)){
        excludedIds.add(option.id);
        if(!omissions.includes(option.name))omissions.push(option.name);
      }
    }
  }
  const allowed=group.options.filter(o=>!excludedIds.has(o.id));
  const all=/\b(todos|misto|misturado|mistura)\b/.test(normalize(current));
  const only=/\b(so|apenas|somente|exclusivamente)\b/.test(normalize(current));
  let chosen=all&&!only?allowed:explicit.filter(o=>!excludedIds.has(o.id));

  // A one-word follow-up naming an excluded flavor is ambiguous, not permission
  // to silently replace the previously agreed exclusion.
  if(!chosen.length&&explicit.length&&explicit.some(o=>excludedIds.has(o.id)))return null;
  if(!chosen.length&&alreadyMixed)chosen=allowed;
  if(!chosen.length||chosen.length>70||units>99*chosen.length)return null;

  const perFlavor=Math.floor(units/chosen.length),remainder=units%chosen.length;
  const extras=chosen.map((o,i)=>({extraId:o.id,quantity:perFlavor+(i<remainder?1:0)}));
  if(extras.some(e=>e.quantity<1||e.quantity>99))return null;
  const cart=currentCart.slice();
  const existing=cart.findIndex(line=>line.productId===product.id);
  const line:CartLine={productId:product.id,quantity:1,extras};
  if(existing>=0)cart[existing]=line;
  else cart.push(line);
  const selected=chosen.map((o,i)=>({name:o.name,quantity:extras[i].quantity}));
  return {cart,selected,reply:response(units,selected,omissions,remainder>0)};
}
