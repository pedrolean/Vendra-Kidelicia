import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCart } from '../lib/cart.ts';
import { chooseVerifiedCart, isCartEditMessage } from '../lib/cartIntent.ts';
import { enrichAddressFromMessage } from '../lib/addressIntent.ts';
import { EMPTY_DRAFT, quoteOrder } from '../lib/checkout.ts';

const optionNames=['Queijo','Carne','Coxinha','Calabresa','Salsicha','Risole'];
const kit={id:'kit100',name:'SALGADOS 100 UNIDADES',category:'Festa',price:79,
  group:[{id:'sabores',name:'SABORES DOS SALGADOS',required:true,multiple_selection:true,min_select:0,max_select:null,
    options:optionNames.map((name,index)=>({id:'sab'+index,name,price:0}))}]};
const catalog={products:[kit,{id:'coca',name:'Coca-Cola 2 Litros',category:'Bebidas',price:16,group:[]}],
  zones:[{city:'Rio Grande da Serra',neighborhood:'Santa Tereza',fee:7},
    {city:'Ribeirão Pires',neighborhood:'Centro',fee:9}],
  settings:{is_open:true,accept_delivery:true,accept_pickup:true,accept_cash:true,accept_pix:true,
    accept_debit:true,accept_credit:true,minimum_order_delivery:0}};
const original={productId:kit.id,quantity:1,extras:[0,1,2,3,4].map(index=>({extraId:'sab'+index,quantity:20}))};
const previous=validateCart([original],catalog);
const corrupt={productId:kit.id,quantity:1,extras:[0,1,2,3].map(index=>({extraId:'sab'+index,quantity:20})).concat([{extraId:'fake',quantity:20}])};
const address='Santa Tereza, av São Paulo 178';

test('cenário exato: endereço após 100 mistos NÃO reescreve sabores',()=>{
  const result=chooseVerifiedCart(address,previous,[corrupt],catalog);
  assert.equal(result.accepted.valid,true);
  assert.deepEqual(result.accepted.cart,previous.cart);
  assert.equal(result.accepted.subtotal,79);
  assert.equal(result.rejectedEdit,false);
});
test('endereço preserva carrinho mesmo se IA omitir todos os sabores',()=>{
  const result=chooseVerifiedCart('Av São Paulo 178, Santa Tereza',previous,[
    {productId:'kit100',quantity:1,extras:[]}
  ],catalog);
  assert.deepEqual(result.accepted.cart,previous.cart);
  assert.equal(result.rejectedEdit,false);
});
test('pagamento e retirada também preservam itens sem erro técnico',()=>{
  for(const message of ['Dinheiro','Pix','Troco para 100','Entrega','Retirada','Agora']){
    const result=chooseVerifiedCart(message,previous,[corrupt],catalog);
    assert.deepEqual(result.accepted.cart,previous.cart,message);
    assert.equal(result.rejectedEdit,false,message);
  }
});
test('bairro e rua não são instruções de alteração de produto',()=>{
  assert.equal(isCartEditMessage(address,catalog),false);
  assert.equal(isCartEditMessage('Av São Paulo 178 Bairro Santa Tereza',catalog),false);
});
test('cliente pode alterar explicitamente seus sabores',()=>{
  const changed={...original,extras:[{extraId:'sab0',quantity:50},{extraId:'sab1',quantity:50}]};
  const result=chooseVerifiedCart('Quero trocar os sabores para 50 queijo e 50 carne',previous,[changed],catalog);
  assert.equal(result.accepted.valid,true);
  assert.equal(result.accepted.cart[0].extras.length,2);
});
test('se uma troca de sabor é inválida mantém pedido e pede correção',()=>{
  const result=chooseVerifiedCart('Tira a salsicha e coloca mais coxinha',previous,[corrupt],catalog);
  assert.equal(result.rejectedEdit,true);
  assert.deepEqual(result.accepted.cart,previous.cart);
});
test('cliente pode adicionar refrigerante sem perder o kit',()=>{
  const result=chooseVerifiedCart('Acrescenta uma Coca-Cola 2 Litros',previous,
    [original,{productId:'coca',quantity:1,extras:[]}],catalog);
  assert.equal(result.accepted.valid,true);
  assert.equal(result.accepted.cart.length,2);
  assert.equal(result.accepted.subtotal,95);
});
test('rua + bairro permite identificar Rio Grande da Serra e valor correto',()=>{
  const start={...EMPTY_DRAFT,fulfillment:'delivery',paymentMethod:'cash'};
  const result=enrichAddressFromMessage(address,start,start,catalog,false);
  assert.equal(result.neighborhood,'Santa Tereza');
  assert.equal(result.city,'Rio Grande da Serra');
  assert.equal(result.street,'av São Paulo');
  assert.equal(result.number,'178');
  const q=quoteOrder(previous,{...result,name:'Pedro'},catalog,{requirePhone:false});
  assert.equal(q.deliveryFee,7);
  assert.equal(q.total,86);
});
test('entrega em Ribeirão Pires identifica a cidade pelo bairro',()=>{
  const draft={...EMPTY_DRAFT,fulfillment:'delivery'};
  const next=enrichAddressFromMessage('Centro, rua Almirante 25',draft,draft,catalog,false);
  assert.equal(next.city,'Ribeirão Pires');
  assert.equal(next.neighborhood,'Centro');
  assert.equal(next.street,'rua Almirante');
  assert.equal(next.number,'25');
});
test('bairro homônimo não adivinha cidade',()=>{
  const zones=[...catalog.zones,{city:'Ribeirão Pires',neighborhood:'Santa Tereza',fee:11}];
  const c={...catalog,zones};
  const draft={...EMPTY_DRAFT,fulfillment:'delivery'};
  const next=enrichAddressFromMessage(address,draft,draft,c,false);
  assert.equal(next.city,'');
  assert.equal(quoteOrder(previous,{...next,name:'Pedro',paymentMethod:'cash'},c,{requirePhone:false}).deliveryFee,null);
});
test('endereço sozinho não cria pedido novo',()=>{
  const empty=validateCart([],catalog);
  const proposed=[original];
  const result=chooseVerifiedCart(address,empty,proposed,catalog);
  assert.deepEqual(result.accepted.cart,[]);
});
