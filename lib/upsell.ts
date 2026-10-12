import type { Catalog, Product } from './catalog';
import type { VerifiedCart } from './cart';

export type UpsellOption={id:string;name:string;price:number;kind:'drink'|'dessert';needsChoice:boolean};

function category(product:Product):'drink'|'dessert'|null{
  const key=(product.name+' '+product.category).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/churros/.test(key))return 'dessert';
  if(/refrigerante|coca.cola|guarana|fanta|soda|pepsi|sprite/.test(key))return 'drink';
  return null;
}
function visiblePrice(product:Product){
  return Number.isFinite(product.price)&&product.price>=0&&product.price<=100000;
}
function containsProduct(cart:VerifiedCart,productId:string){
  return cart.cart.some(line=>line.productId===productId);
}
function money(value:number){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);}

export function upsellOptions(cart:VerifiedCart,catalog:Catalog):UpsellOption[]{
  const present=new Set<'drink'|'dessert'>();
  for(const line of cart.cart){
    const item=catalog.products.find(p=>p.id===line.productId);
    if(item){const kind=category(item);if(kind)present.add(kind);}
  }
  const candidates=catalog.products.filter(p=>{
    const kind=category(p);
    return kind&&!present.has(kind)&&visiblePrice(p)&&!containsProduct(cart,p.id);
  });
  const drinks=candidates.filter(p=>category(p)==='drink').sort((a,b)=>a.price-b.price).slice(0,2);
  const desserts=candidates.filter(p=>category(p)==='dessert').sort((a,b)=>a.price-b.price).slice(0,2);
  return [...drinks,...desserts].map(p=>({
    id:p.id,name:p.name,price:p.price,kind:category(p)!,
    needsChoice:p.group.some(g=>g.required||g.min_select>0)
  }));
}
export function hasSuggestedExtras(cart:VerifiedCart,catalog:Catalog){
  return cart.cart.some(line=>{
    const product=catalog.products.find(p=>p.id===line.productId);
    return product?category(product)!==null:false;
  });
}
export function makeUpsellText(options:UpsellOption[]){
  if(!options.length)return null;
  const titles=options.map(o=>'• '+o.name+' — '+money(o.price)+(o.needsChoice?' (a partir de, conforme opções)':''));
  return 'Seu pedido já está quase pronto! 😊 Quer aproveitar e acrescentar um refrigerante ou churros?\n'+
    titles.join('\n')+'\n\nSe não quiser, é só dizer “não, obrigado”.';
}
export function isUpsellDecline(message:string){
  const text=message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[.!?]/g,'');
  return /^(nao|nao obrigado|nao obrigada|sem nada|dispenso|so isso|somente isso|pode fechar|nao quero|deixa assim|sem adicionais)$/.test(text);
}
export function isVagueUpsellYes(message:string){
  const text=message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[.!?]/g,'');
  return /^(sim|quero|pode ser|pode|coloca|adiciona|manda|um deles)$/.test(text);
}
