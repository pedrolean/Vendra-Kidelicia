import test from 'node:test';
import assert from 'node:assert/strict';
import {handleFastStep} from '../lib/fastStep.ts';
import {validateCart} from '../lib/cart.ts';
import {chooseVerifiedCart,isCartEditMessage} from '../lib/cartIntent.ts';
import {EMPTY_DRAFT} from '../lib/checkout.ts';
import {resolveMixedFlavorIntent} from '../lib/flavorIntent.ts';

const products=[
 {id:'s100',name:'SALGADOS 100 UNIDADES',description:null,category:'Festas',price:79,group:[
   {id:'f',name:'SABORES DOS SALGADOS',required:true,multiple_selection:true,min_select:0,max_select:null,
   options:[{id:'c',name:'COXINHA',price:0},{id:'q',name:'QUEIJO',price:0},{id:'r',name:'RISOLE',price:0}]}]},
 {id:'coca2l',name:'COCA-COLA 2 LITROS',description:null,category:'Bebidas',price:16,group:[]},
 {id:'guarana600',name:'GUARANÁ ANTARCTICA 600ML',description:null,category:'Bebidas',price:8,group:[]},
 {id:'churros10',name:'10 CHURROS CHOCOLATE',description:null,category:'Doces',price:12,group:[]}
];
const catalog={products,zones:[{city:'Rio Grande da Serra',neighborhood:'Santa Tereza',fee:7}],
 settings:{is_open:true,business_hours:Array.from({length:7},(_,day)=>({day,enabled:true,open:'00:00',close:'00:00'})),
  accept_delivery:true,accept_pickup:true,accept_pix:true,accept_cash:true,accept_debit:true,accept_credit:true,minimum_order_delivery:0}};
const base=validateCart([{productId:'s100',quantity:1,extras:[{extraId:'c',quantity:50},{extraId:'q',quantity:50}]}],catalog);
const d=(data={})=>({...EMPTY_DRAFT,...data});
const fast=(message,draft=EMPTY_DRAFT,lastAssistant='',cat=catalog)=>handleFastStep({message,lastAssistant,draft,cart:base,catalog:cat});
const delivered=d({fulfillment:'delivery',city:'Rio Grande da Serra',neighborhood:'Santa Tereza',street:'Av São Paulo',number:'178',paymentMethod:'cash'});

test('resposta entrega não passa pela IA e não pergunta cidade antes do bairro',()=>{
 const r=fast('Entrega');
 assert.ok(r);assert.equal(r.draft.fulfillment,'delivery');assert.match(r.reply,/bairro da entrega/i);
 assert.doesNotMatch(r.reply,/qual é a cidade/i);
});
test('bairro e avenida na mesma mensagem: preserva 100 salgados e segue pagamento',()=>{
 const r=fast('Santa Tereza, av São Paulo 178',d({fulfillment:'delivery'}));
 assert.ok(r);assert.equal(r.draft.city,'Rio Grande da Serra');
 assert.equal(r.draft.street,'av São Paulo');assert.equal(r.draft.number,'178');
 assert.deepEqual(r.cart.cart,base.cart);
 assert.match(r.reply,/prefere pagar/i);
});
test('dinheiro após endereço: oferece bebidas e churros uma única vez',()=>{
 const r=fast('Dinheiro',d({...delivered,paymentMethod:null}));
 assert.ok(r);assert.equal(r.draft.upsellStatus,'offered');
 assert.match(r.reply,/COCA-COLA 2 LITROS/);
 assert.match(r.reply,/CHURROS CHOCOLATE/);
});
test('resposta não obrigado depois da oferta pede somente nome',()=>{
 const r=fast('Não, obrigado',d({...delivered,upsellStatus:'offered'}));
 assert.ok(r);assert.equal(r.draft.upsellStatus,'declined');assert.match(r.reply,/qual é seu nome/i);
});
test('resposta sim após a oferta não acrescenta item sem escolher',()=>{
 const r=fast('Sim',d({...delivered,upsellStatus:'offered'}));
 assert.ok(r);assert.deepEqual(r.cart.cart,base.cart);
 assert.match(r.reply,/COCA-COLA/);assert.equal(r.draft.upsellStatus,'offered');
});
test('cliente escolhe uma Coca-Cola 2L e preserva o kit',()=>{
 const r=fast('Quero a Coca-Cola 2 Litros',d({...delivered,upsellStatus:'offered'}));
 assert.ok(r);assert.equal(r.cart.cart.length,2);assert.equal(r.cart.subtotal,95);
 assert.equal(r.draft.upsellStatus,'accepted');assert.match(r.reply,/qual é seu nome/i);
});
test('cliente escolhe churros e não perde sabores',()=>{
 const r=fast('Quero os churros',d({...delivered,upsellStatus:'offered'}));
 assert.ok(r);assert.equal(r.cart.cart.length,2);assert.equal(r.cart.subtotal,91);
});
test('marca com duas variantes exige escolha em vez de escolher pelo cliente',()=>{
 const variant={id:'coca350',name:'COCA-COLA LATA 350ML',description:null,category:'Bebidas',price:7,group:[]};
 const cat={...catalog,products:[...products,variant]};
 const r=fast('Quero uma Coca',d({...delivered,upsellStatus:'offered'}),'',cat);
 assert.ok(r);assert.equal(r.cart.cart.length,1);assert.match(r.reply,/Qual você prefere/i);
 assert.match(r.reply,/COCA-COLA LATA/);
});
test('nome pedido ao final aceita apenas o nome, sem chamada IA',()=>{
 const r=fast('Pedro',d({...delivered,upsellStatus:'declined'}),'Para concluir a simulação, qual é seu nome?');
 assert.ok(r);assert.equal(r.draft.name,'Pedro');assert.match(r.reply,/total/i);
});
test('a troca intencional de sabores continua com IA e validação',()=>{
 assert.equal(fast('Troca 50 coxinhas por 50 risoles',delivered),null);
});
test('dúvida quanto custa Coca não modifica carrinho',()=>{
 assert.equal(isCartEditMessage('Quanto custa a Coca-Cola 2 Litros?',catalog),false);
 const b=chooseVerifiedCart('Quanto custa a Coca-Cola 2 Litros?',base,[{productId:'coca2l',quantity:1,extras:[]}],catalog);
 assert.deepEqual(b.accepted.cart,base.cart);
});
test('100 unidades de um único sabor são válidas',()=>{
 assert.equal(validateCart([{productId:'s100',quantity:1,extras:[{extraId:'c',quantity:100}]}],catalog).valid,true);
 const resolved=resolveMixedFlavorIntent([{role:'user',content:'Quero 100 salgados só de coxinha'}],catalog,[]);
 assert.ok(resolved);
 assert.equal(validateCart(resolved.cart,catalog).valid,true);
});
test('itens idênticos duplicados são rejeitados e não perdem contagem',()=>{
 const twice=validateCart([{productId:'coca2l',quantity:1,extras:[]},{productId:'coca2l',quantity:1,extras:[]}],catalog);
 assert.equal(twice.valid,false);
});
