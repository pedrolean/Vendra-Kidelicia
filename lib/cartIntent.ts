import type { Catalog } from './catalog';
import { validateCart, type VerifiedCart } from './cart.ts';

function normalize(text:string){
 return text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
function word(text:string,part:string) {
 return (' '+text+' ').includes(' '+part+' ');
}
/**
 * Positive allow-list: a validated cart can ONLY change when the client
 * clearly asks for a product/quantity/flavor edit. Address, neighborhood,
 * phone, payment and scheduling must never allow the LLM to rewrite the cart.
 */
export function isCartEditMessage(message:string,catalog:Catalog):boolean {
 const text=normalize(message);
 if(!text)return false;
 const orderWords=/\b(salgad\w*|coxinh\w*|risol\w*|bolinh\w*|churro\w*|refri\w*|guarana|coca|bebida\w*|calabresa|salsicha|queijo|carne|sabor\w*|kit\w*|combo\w*|esfiha\w*|porcao|pizz\w*|adicionai\w*|adicional|pedido|item|molho\w*)\b/;
 const explicitAction=/\b(quero|queria|pedir|adiciona\w*|inclui\w*|coloca\w*|bota\w*|acrescenta\w*|retira\w*|remove\w*|tira|tirar|cancela\w*|troca\w*|trocar|muda\w*|mudar|altera\w*|alterar|corrige\w*|substitui\w*|menos|sem|mais|so|apenas|somente|prefiro|exclui\w*)\b/;
 const catalogMention=catalog.products.some(product=>{
   const name=normalize(product.name);
   return name.length>=4&&(word(text,name)||name.split(' ').filter(t=>t.length>3).some(t=>word(text,t)&&/\b(quero|acrescenta|adiciona|coloca|troca|tira|sem|menos|mais)\b/.test(text)));
 });
 const itemMentions=orderWords.test(text)||catalogMention;
 if(!itemMentions)return false;
 // Questions about products aren't instructions to modify an existing order.
 if(/^(quanto|qual|quais|tem |voces tem|quanto custa|quanto fica|me diz|me fala)\b/.test(text)&&
   !/\b(coloca|adiciona|inclui|tira|troca|muda|quero)\b/.test(text))return false;
 return explicitAction.test(text) ||
  /^\d+\s+(salgados?|coxinhas?|risoles?|churros?|refrigerantes?)\b/.test(text) ||
  /^(coca cola|guarana|refrigerante|churros)\b/.test(text);
}
export type CartDecision={accepted:VerifiedCart;rejectedEdit:boolean;protectedPrevious:boolean};
export function chooseVerifiedCart(
 message:string,previous:VerifiedCart,proposal:unknown,catalog:Catalog
):CartDecision {
 const candidate=validateCart(proposal===undefined?previous.cart:proposal,catalog);
 if(!previous.valid)return {accepted:candidate.valid?candidate:validateCart([],catalog),rejectedEdit:!candidate.valid,protectedPrevious:false};
 if(!isCartEditMessage(message,catalog)){
   return {accepted:previous,rejectedEdit:false,protectedPrevious:true};
 }
 if(!candidate.valid)return {accepted:previous,rejectedEdit:true,protectedPrevious:true};
 return {accepted:candidate,rejectedEdit:false,protectedPrevious:false};
}
