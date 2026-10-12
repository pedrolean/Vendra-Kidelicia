import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCart } from '../lib/cart.ts';
import { EMPTY_DRAFT, quoteOrder } from '../lib/checkout.ts';
import { safeCheckoutReply } from '../lib/checkoutDialogue.ts';
const products=[{id:'kit',name:'SALGADOS 50 UNIDADES',description:null,category:'Salgados',price:43,group:[{
  id:'flavors',name:'SABORES DOS SALGADOS',required:true,multiple_selection:true,min_select:0,max_select:null,options:[
    {id:'q',name:'Queijo',price:0},{id:'r',name:'Risole',price:0},{id:'c',name:'Coxinha',price:0},{id:'a',name:'Calabresa',price:0},{id:'s',name:'Salsicha',price:0}
  ]
}]}];
const enabledHours=Array.from({length:7},(_,day)=>({day,enabled:true,open:'00:00',close:'00:00'}));
const disabledHours=enabledHours.map(h=>({...h,enabled:false}));
function catalog(open=true,registered=true){
 return {products,zones:registered?[{city:'Rio Grande da Serra',neighborhood:'Santa Tereza',fee:7}]:[],
 settings:{is_open:open,business_hours:open?enabledHours:disabledHours,minimum_order_delivery:0,accept_delivery:true,accept_pickup:true,accept_pix:true,accept_cash:true,accept_debit:true,accept_credit:true}}
}
const cart={productId:'kit',quantity:1,extras:['q','r','c','a','s'].map(extraId=>({extraId,quantity:10}))};
const confirmed={...EMPTY_DRAFT,name:'Pedro',phone:'11999990000',fulfillment:'delivery',city:'Rio Grande da Serra',neighborhood:'Santa Tereza',street:'Av. São Paulo',number:'178',paymentMethod:'cash'};
function reply(text,draft=confirmed,cat=catalog()){
 const validated=validateCart([cart],cat);
 const quote=quoteOrder(validated,draft,cat);
 return safeCheckoutReply({text,previous:EMPTY_DRAFT,draft,cart:validated,quote,catalog:cat})?.replace(/\u00a0/g,' ');
}
test('50 salgados custa R$ 43 antes do frete',()=>{
 const result=validateCart([cart],catalog());
 assert.equal(result.valid,true);assert.equal(result.subtotal,43);
});
test('entrega confirmada tem total igual a produtos + frete',()=>{
 const result=reply('dinheiro');
 assert.match(result,/R\$ 43,00/); assert.match(result,/R\$ 7,00/); assert.match(result,/R\$ 50,00/);
});
test('pedido para agora com loja fechada não pede agendamento ou novo horário',()=>{
 const result=reply('Agora',confirmed,catalog(false));
 assert.match(result,/n[aã]o consigo confirmar atendimento imediato/i);
 assert.match(result,/R\$ 50,00/);
 assert.doesNotMatch(result,/qual data|qual hor[aá]rio|que dia/i);
});
test('pedido para agora com bairro não cadastrado não inventa frete',()=>{
 const result=reply('Agora',confirmed,catalog(false,false));
 assert.match(result,/Frete e total dependem de confirmação/i);
 assert.doesNotMatch(result,/R\$ 50,00/);
});
test('pedido imediato não deve virar encomenda automaticamente',()=>{
 const result=reply('Agora',confirmed,catalog());
 assert.match(result,/resumo do teste/i);
 assert.doesNotMatch(result,/qual data|qual hor[aá]rio/i);
});
test('se falta cidade, pergunta só cidade e não soma frete',()=>{
 const result=reply('Entrega',{...confirmed,city:''});
 assert.equal(result,'Qual é a cidade para a entrega?');
});
test('bairro ausente recebe pergunta objetiva antes do valor final',()=>{
 const result=reply('dinheiro',{...confirmed,neighborhood:''});
 assert.match(result,/Qual é o bairro/);
});
test('bairro não confirmado exige checagem humana',()=>{
 const result=reply('dinheiro',confirmed,catalog(true,false));
 assert.match(result,/n[aã]o consegui confirmar entrega e taxa/i);
 assert.doesNotMatch(result,/R\$ 50,00/);
});
test('pagamento não escolhido recebe uma pergunta',()=>{
 const result=reply('Entrega',{...confirmed,paymentMethod:null});
 assert.match(result,/Como você prefere pagar/i);
});
test('dados de checkout alterados geram resumo fundamentado',()=>{
 const result=reply('Obrigado',confirmed,catalog());
 assert.equal(result,'Resumo do teste: produtos R$ 43,00 + taxa de entrega R$ 7,00, total R$ 50,00. Pagamento em dinheiro. O horário e a disponibilidade ainda precisam ser confirmados pela equipe. Nenhum pedido ou pagamento real foi registrado.');
});
