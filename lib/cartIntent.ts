import type { Catalog, Product } from './catalog';
import { validateCart, type CartLine, type VerifiedCart } from './cart.ts';

function norm(text:string){
 return text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function contains(text:string,word:string){
 return (' '+norm(text)+' ').includes(' '+norm(word)+' ');
}
const explicit=/\b(quero|queria|pedir|adiciona\w*|inclui\w*|coloca\w*|bota\w*|acrescenta\w*|retira\w*|remove\w*|tira|tirar|cancela\w*|troca\w*|trocar|muda\w*|mudar|altera\w*|alterar|corrige\w*|substitui\w*|menos|sem|mais|so|apenas|somente|prefiro|exclui\w*|me ve|manda|separa)\b/;
const products=/\b(salgad\w*|coxinh\w*|risol\w*|bolinh\w*|churro\w*|refri\w*|guarana|coca|bebida\w*|calabresa|salsicha|queijo|carne|sabor\w*|kit\w*|combo\w*|esfiha\w*|porcao|pizz\w*|adicionai\w*|adicional|molho\w*)\b/;
const removals=/\b(tira|tirar|retira\w*|remove\w*|cancela\w*|exclui\w*|sem|menos|nao quero)\b/;
function productMentioned(message:string,product:Product){
 const text=norm(message),name=norm(product.name);
 if(contains(text,name))return true;
 if(contains(name,'salgados')&&contains(text,'salgados'))return true;
 const meaningful=name.split(' ').filter(x=>x.length>4&&!['unidades','porcao','unidade','bebidas','salgados'].includes(x));
 return meaningful.some(token=>contains(text,token));
}
function flavorMentioned(message:string,product:Product){
 return product.group.some(g=>g.options.some(opt=>contains(message,opt.name)));
}
function lineEqual(a:CartLine,b:CartLine){
 return a.quantity===b.quantity&&a.notes===b.notes&&
  a.extras.length===b.extras.length &&
  a.extras.every(x=>b.extras.some(y=>y.extraId===x.extraId&&y.quantity===x.quantity));
}
export function isCancelEntireOrder(message:string):boolean{
 const text=norm(message);
 return /^(?:cancela|cancelar|cancele|apaga|apagar|limpa|limpar|exclui|excluir|remove|remover|desisto|nao quero mais)(?: o| os| meu| meus| esse| essa)? (?:pedido|pedidos|carrinho|itens|tudo)$/.test(text) ||
   /^(?:cancela|cancelar|apaga|limpa|exclui|remove|remover) tudo$/.test(text);
}
export function isCartEditMessage(message:string,catalog:Catalog):boolean{
 const text=norm(message);
 if(!text)return false;
 const relevant=products.test(text)||catalog.products.some(product=>productMentioned(message,product));
 if(!relevant)return false;
 // A question about the menu isn't a purchase.
 if(/^(quanto|qual|quais|tem|voces tem|quanto custa|quanto fica|me diz|me fala)\b/.test(text)&&
  !/\b(coloca|adiciona|inclui|tira|troca|muda|quero|manda)\b/.test(text))return false;
 return explicit.test(text)||/^\d+\s+(salgados?|coxinhas?|risoles?|churros?|refrigerantes?)\b/.test(text);
}
export type CartDecision={accepted:VerifiedCart;rejectedEdit:boolean;protectedPrevious:boolean};
export function chooseVerifiedCart(message:string,previous:VerifiedCart,proposal:unknown,catalog:Catalog):CartDecision{
 const candidate=validateCart(proposal===undefined?previous.cart:proposal,catalog);
 if(!previous.valid)return {accepted:candidate.valid?candidate:validateCart([],catalog),rejectedEdit:!candidate.valid,protectedPrevious:false};
 if(!isCartEditMessage(message,catalog))return {accepted:previous,rejectedEdit:false,protectedPrevious:true};
 if(!candidate.valid)return {accepted:previous,rejectedEdit:true,protectedPrevious:true};
 const before=new Map(previous.cart.map(line=>[line.productId,line]));
 const after=new Map(candidate.cart.map(line=>[line.productId,line]));
 const removing=removals.test(norm(message));
 for(const [productId,old] of before){
   const now=after.get(productId);
   const product=catalog.products.find(p=>p.id===productId);
   if(!product)return {accepted:previous,rejectedEdit:true,protectedPrevious:true};
   if(!now){
     if(!removing||!productMentioned(message,product))
       return {accepted:previous,rejectedEdit:true,protectedPrevious:true};
   }else if(!lineEqual(now,old)){
     if(!productMentioned(message,product)&&!flavorMentioned(message,product))
       return {accepted:previous,rejectedEdit:true,protectedPrevious:true};
   }
 }
 return {accepted:candidate,rejectedEdit:false,protectedPrevious:false};
}
