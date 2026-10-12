import type { Catalog, Product, Group } from './catalog';

export type Selected = {extraId:string;quantity:number};
export type CartLine = {productId:string;quantity:number;extras:Selected[];notes?:string};
export type VerifiedCart = {cart:CartLine[];subtotal:number;problems:string[];summary:string[];valid:boolean};

const MAX_LINES=25;
function count(value:unknown,max:number) {
  if(typeof value!=='number'||!Number.isInteger(value)||value<1||value>max)return null;
  return value;
}
function money(v:number){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);}
function flavorTarget(product:Product,group:Group,quantity:number) {
  if(!/SABORES\s+DOS\s+SALGADOS/i.test(group.name))return null;
  const m=product.name.match(/SALGADOS\s+(\d+)\s+UNIDADES/i);
  return m ? Number(m[1])*quantity : null;
}
function asCents(price:number) {
  if(!Number.isFinite(price)||price<0||price>1000000)return null;
  return Math.round(price*100);
}
/**
 * Prices and selectable variants are always calculated from the live PedidoPro
 * catalogue, never from client/model supplied amounts.
 * Mirrors PedidoPro's current "(unit price + option sum) × product quantity".
 * No partial/invalid model cart can ever be accepted by the chat route.
 */
export function validateCart(input:unknown,catalog:Catalog):VerifiedCart {
  const cart:CartLine[]=[],problems:string[]=[],summary:string[]=[];
  let cents=0;
  if(!Array.isArray(input))return {cart,subtotal:0,problems:['O carrinho recebido não é válido.'],summary,valid:false};
  if(input.length>MAX_LINES)problems.push('Há itens demais no carrinho. Divida a encomenda e confirme com a equipe.');
  const productsById=new Map(catalog.products.map(product=>[product.id,product]));
  const usedLines=new Set<string>();
  for(const raw of input.slice(0,MAX_LINES)) {
    if(!raw||typeof raw!=='object'){problems.push('Item inválido.');continue;}
    const product=productsById.get(raw.productId);
    if(!product){problems.push('Um produto está indisponível no cardápio.');continue;}
    // Duplicate product rows confuse edits and prices; ask the model to merge
    // amounts for identical IDs instead of silently dropping entries.
    if(usedLines.has(product.id)){problems.push('Produto repetido no carrinho: '+product.name+'.');continue;}
    usedLines.add(product.id);
    const quantity=count(raw.quantity,100);
    if(quantity===null){problems.push('Quantidade inválida para '+product.name+'.');continue;}
    const base=asCents(product.price);
    if(base===null){problems.push('Preço indisponível para '+product.name+'.');continue;}
    if(!Array.isArray(raw.extras)){problems.push('Opções inválidas de '+product.name+'.');continue;}
    if(raw.extras.length>70)problems.push('Muitas opções selecionadas para '+product.name+'.');
    const selected:Selected[]=[];const groupCounts=new Map<string,number>();
    let extraCents=0;
    const usedIds=new Set<string>();
    for(const entry of raw.extras.slice(0,70)){
      const id=entry?.extraId;
      const group=product.group.find(g=>g.options.some(o=>o.id===id));
      const option=group?.options.find(o=>o.id===id);
      const n=count(entry?.quantity,/SABORES\s+DOS\s+SALGADOS/i.test(group?.name||'')?10000:99);
      if(!group||!option||n===null||usedIds.has(id)){
        problems.push('Sabor/adicional inválido, repetido ou com quantidade fora do limite em '+product.name+'.');continue;
      }
      const cost=asCents(option.price);
      if(cost===null){problems.push('Preço de adicional inválido em '+product.name+'.');continue;}
      usedIds.add(id);selected.push({extraId:id,quantity:n});
      groupCounts.set(group.id,(groupCounts.get(group.id)||0)+n);
      extraCents+=cost*n;
    }
    for(const group of product.group){
      const selectedCount=groupCounts.get(group.id)||0;
      const target=flavorTarget(product,group,quantity);
      if(target!==null&&selectedCount!==target)problems.push(product.name+': escolha exatamente '+target+' salgados entre os sabores; escolhidos: '+selectedCount+'.');
      if(target===null&&group.required&&!selectedCount)problems.push(product.name+': escolha '+group.name+'.');
      if(target===null&&group.min_select>selectedCount)problems.push(product.name+': mínimo '+group.min_select+' em '+group.name+'.');
      if(group.max_select!==null&&selectedCount>group.max_select)problems.push(product.name+': máximo '+group.max_select+' em '+group.name+'.');
      if(target===null&&!group.multiple_selection&&selected.filter(e=>group.options.some(o=>o.id===e.extraId)).length>1)problems.push(product.name+': apenas uma opção em '+group.name+'.');
    }
    const notes=typeof raw.notes==='string'?raw.notes.slice(0,300):'';
    const lineCents=(base+extraCents)*quantity;
    if(!Number.isSafeInteger(lineCents)){problems.push('Valor muito alto para validar automaticamente.');continue;}
    cents+=lineCents;
    cart.push({productId:product.id,quantity,extras:selected,notes});
    summary.push(quantity+'x '+product.name+' — '+money(lineCents/100));
  }
  if(!Number.isSafeInteger(cents))problems.push('Total do pedido fora do limite.');
  return {cart,subtotal:Number.isSafeInteger(cents)?cents/100:0,problems,summary,valid:problems.length===0};
}
