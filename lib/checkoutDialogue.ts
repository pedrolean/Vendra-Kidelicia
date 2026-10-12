import type { Catalog } from './catalog';
import type { VerifiedCart } from './cart';
import type { Draft, Quote } from './checkout';
import {makeUpsellText, upsellOptions} from './upsell.ts';

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function money(value:number){
  return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);
}
function has(text:string,pattern:RegExp){return pattern.test(normalize(text));}
function requiredDataChanged(previous:Draft, next:Draft){
  return (['name','phone','fulfillment','city','neighborhood','street','number','paymentMethod','changeFor'] as const)
    .some(key=>previous[key]!==next[key]);
}
function paymentLabel(code:Draft['paymentMethod']){
  return {pix:'Pix',cash:'dinheiro',debit:'débito',credit:'crédito'}[code||'pix'];
}

/**
 * Response guard: creates grounded, short checkout turns. An LLM may collect
 * details, but it cannot determine delivery availability, final totals, or
 * realtime fulfillment. The live PedidoPro settings and quote decide that.
 */
export function safeCheckoutReply(args:{
  text:string; previous:Draft; draft:Draft; cart:VerifiedCart; quote:Quote;
  catalog:Catalog
}):string|null{
  const {text,previous,draft,cart,quote,catalog}=args;
  if(!cart.cart.length)return null;
  const immediate=has(text,/\b(agora|ja|imediat|o mais rapido|pra hoje|para hoje)\b/);
  const future=has(text,/\b(amanha|depois|agendar|encomenda|proxima semana)\b/);
  const checkout=has(text,/\b(entrega|entregar|delivery|retirada|retirar|buscar|endereco|bairro|cidade|frete|taxa|pix|dinheiro|cartao|debito|credito|pagamento|troco|total|resumo|finalizar|fechar|concluir|confirmar|quanto fica|quanto deu|pagar)\b/);
  // A phone number / checkout field in free text is also actionable.
  if(!immediate&&!future&&!checkout&&!requiredDataChanged(previous,draft)&&previous.upsellStatus===draft.upsellStatus)return null;

  const shopUnavailable=!quote.storeOpen;
  if(immediate&&!future&&shopUnavailable){
    const value=quote.deliveryFee!==null && quote.total!==null
      ? 'Produtos '+money(cart.subtotal)+' + entrega '+money(quote.deliveryFee)+' = '+money(quote.total)+'. '
      : 'Produtos '+money(cart.subtotal)+'. Frete e total dependem de confirmação do bairro. ';
    const addr=draft.fulfillment==='delivery' && quote.deliveryFee===null
      ? 'Também não consegui confirmar a taxa e a cobertura para '+(draft.neighborhood||'o bairro informado')+'. '
      : '';
    return 'Entendi, você quer para agora. Não consigo confirmar atendimento imediato conforme o funcionamento cadastrado. '+value+addr+'Se quiser outro horário, a equipe precisa confirmar a disponibilidade. Nenhum pedido foi enviado ou agendado.';
  }
  if(draft.requestedWhen&&!immediate){
    // Scheduling cannot be guaranteed by the lab, regardless of fields.
    if(future)return 'Anotei a data desejada, mas a encomenda ainda depende da confirmação da equipe. Podemos seguir com o orçamento, sem reservar automaticamente.';
  }
  if(!draft.fulfillment)return 'Você prefere receber por entrega ou fazer a retirada?';
  if(draft.fulfillment==='delivery'&&catalog.settings.accept_delivery!==true)
    return 'O delivery não está disponível nas configurações atuais. Quer verificar a retirada?';
  if(draft.fulfillment==='pickup'&&catalog.settings.accept_pickup!==true)
    return 'A retirada não está disponível nas configurações atuais. Posso verificar as opções de entrega?';

  // Delivery coverage and fees always take priority over payment or any
  // reassurance from the language model.
  if(draft.fulfillment==='delivery'){
    if(!draft.neighborhood)return 'Qual é o bairro da entrega? Pode enviar bairro, rua e número juntos para agilizar. 😊';
    if(!draft.city)return 'Qual é a cidade para a entrega? Esse bairro pode existir nas duas cidades.';
    if(quote.deliveryFee===null){
      return 'Ainda não consegui confirmar entrega e taxa para o bairro '+draft.neighborhood+
        ', em '+draft.city+'. Preciso que a equipe confira a região antes de informar o valor final. Não vou inventar o frete.';
    }
    if(!draft.street)return 'Esse bairro consta nas regiões cadastradas. Qual é a rua ou avenida da entrega?';
    if(!draft.number)return 'E qual é o número do endereço?';
  }
  if(!draft.paymentMethod)return 'Como você prefere pagar: Pix, dinheiro, débito ou crédito?';
  const paymentEnabled=({
    pix:'accept_pix',cash:'accept_cash',debit:'accept_debit',credit:'accept_credit'
  } as const)[draft.paymentMethod];
  if(catalog.settings[paymentEnabled]!==true)
    return 'Essa forma de pagamento não está habilitada no cardápio. Quer escolher outra?';
  if(quote.issues.some(issue=>issue.startsWith('Pedido mínimo')))
    return 'Para '+(draft.fulfillment==='delivery'?'entrega':'retirada')+
      ', o pedido mínimo em produtos é '+money(quote.minimumOrder)+
      '. O pedido atual tem '+money(cart.subtotal)+'. Quer acrescentar algo?';
  if(quote.issues.some(issue=>issue.startsWith('Troco')))
    return 'Para pagamento em dinheiro, preciso confirmar um valor para troco maior que o total. Pode me dizer para quanto?';
  if(draft.upsellStatus==='offered' && previous.upsellStatus!=='offered'){
    const offer=makeUpsellText(upsellOptions(cart,catalog));
    if(offer)return offer;
  }
  if(draft.upsellStatus==='offered' && previous.upsellStatus==='offered'){
    return 'Quer acrescentar uma das opções ou prefere seguir sem adicionais?';
  }
  if(!draft.name)return 'Para concluir a simulação, qual é seu nome?';
  if(!quote.readyForSimulation){
    return 'Ainda preciso conferir alguns dados antes do resumo: '+quote.issues.slice(0,2).join(' ');
  }
  const fee=quote.deliveryFee||0;
  const delivery=draft.fulfillment==='delivery'?
    ' + taxa de entrega '+money(fee):' (retirada sem frete)';
  const summary='Resumo do teste: produtos '+money(cart.subtotal)+delivery+
    ', total '+money(quote.total??cart.subtotal)+'. Pagamento em '+paymentLabel(draft.paymentMethod)+'.';
  const clarification=shopUnavailable?
    ' O atendimento imediato não está confirmado; a equipe precisa verificar a disponibilidade.':
    ' O horário e a disponibilidade ainda precisam ser confirmados pela equipe.';
  return summary+clarification+' Nenhum pedido ou pagamento real foi registrado.';
}
