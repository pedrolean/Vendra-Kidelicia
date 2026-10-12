import type { Catalog, Product, Group } from './catalog';
export type Selected={extraId:string;quantity:number};
export type CartLine={productId:string;quantity:number;extras:Selected[];notes?:string};
export type VerifiedCart={cart:CartLine[];subtotal:number;problems:string[];summary:string[]};
function positiveInt(n:unknown,max:number):number {const v=Number(n);return Number.isInteger(v)&&v>0&&v<=max?v:0;}
function flavorTarget(product:Product,group:Group,qty:number):number|null {
  if(!/SABORES\s+DOS\s+SALGADOS/i.test(group.name))return null;
  const m=product.name.match(/SALGADOS\s+(\d+)\s+UNIDADES/i);
  return m?Number(m[1])*qty:null;
}
export function validateCart(input:unknown,catalog:Catalog):VerifiedCart {
  const cart:CartLine[]=[],problems:string[]=[],summary:string[]=[];
  let subtotal=0;
  if(!Array.isArray(input))return {cart,subtotal,problems,summary};
  for(const raw of input.slice(0,25)) {
    if(!raw || typeof raw!=='object')continue;
    const product=catalog.products.find(p=>p.id===raw.productId);
    if(!product){problems.push('Um produto não pertence ao cardápio.');continue;}
    const quantity=positiveInt(raw.quantity,100);
    if(!quantity){problems.push('Quantidade inválida para '+product.name+'.');continue;}
    const selections:Selected[]=[];const groupCounts=new Map<string,number>();
    let extrasTotal=0;
    for(const selected of (Array.isArray(raw.extras)?raw.extras:[]).slice(0,70)) {
      const group=product.group.find(g=>g.options.some(o=>o.id===selected?.extraId));
      const option=group?.options.find(o=>o.id===selected?.extraId);
      const n=positiveInt(selected?.quantity,500);
      if(!group||!option||!n||selections.some(s=>s.extraId===option.id)){problems.push('Sabor ou adicional inválido em '+product.name+'.');continue;}
      selections.push({extraId:option.id,quantity:n});
      groupCounts.set(group.id,(groupCounts.get(group.id)||0)+n);
      extrasTotal+=option.price*n;
    }
    for(const group of product.group) {
      const count=groupCounts.get(group.id)||0;
      const target=flavorTarget(product,group,quantity);
      if(target!==null && count!==target)problems.push(product.name+': selecione exatamente '+target+' salgados entre os sabores (atual: '+count+').');
      if(target===null&&group.required&&count===0)problems.push('Falta escolher '+group.name+' em '+product.name+'.');
      if(target===null&&count<group.min_select)problems.push('Mínimo de '+group.min_select+' em '+group.name+'.');
      if(target===null&&group.max_select!==null&&count>group.max_select)problems.push('Máximo de '+group.max_select+' em '+group.name+'.');
      if(target===null&&!group.multiple_selection&&selections.filter(x=>group.options.some(o=>o.id===x.extraId)).length>1)problems.push('Escolha apenas uma opção em '+group.name+'.');
    }
    const notes=typeof raw.notes==='string'?raw.notes.slice(0,300):'';
    cart.push({productId:product.id,quantity,extras:selections,notes});
    subtotal+=(product.price+extrasTotal)*quantity;
    summary.push(quantity+'x '+product.name+' — R$ '+((product.price+extrasTotal)*quantity).toFixed(2).replace('.',','));
  }
  return {cart,subtotal:Math.round(subtotal*100)/100,problems,summary};
}
