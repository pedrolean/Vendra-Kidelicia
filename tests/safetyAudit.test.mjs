import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCart} from '../lib/cart.ts';
import {chooseVerifiedCart,isCancelEntireOrder,isCartEditMessage} from '../lib/cartIntent.ts';
import {enrichAddressFromMessage} from '../lib/addressIntent.ts';
import {EMPTY_DRAFT,quoteOrder} from '../lib/checkout.ts';

const kit={id:'kit',name:'SALGADOS 100 UNIDADES',price:79,category:'Festa',description:null,group:[
 {id:'flavor',name:'SABORES DOS SALGADOS',required:true,multiple_selection:true,min_select:0,max_select:null,
 options:[{id:'cox',name:'COXINHA',price:0},{id:'que',name:'QUEIJO',price:0}]}]};
const coke={id:'coke',name:'COCA-COLA 2 LITROS',price:16,category:'Bebidas',description:null,group:[]};
const churros={id:'churros',name:'10 CHURROS CHOCOLATE',price:12,category:'Doces',description:null,group:[]};
const catalog={products:[kit,coke,churros],zones:[{city:'Rio Grande da Serra',neighborhood:'Santa Tereza',fee:7}],settings:{is_open:true,accept_delivery:true,accept_pickup:true,accept_cash:true,accept_pix:true}};
const kitLine={productId:kit.id,quantity:1,extras:[{extraId:'cox',quantity:50},{extraId:'que',quantity:50}]};
const cokeLine={productId:coke.id,quantity:1,extras:[]};
const prior=validateCart([kitLine,cokeLine],catalog);
test('mensagem Pix não pode substituir o carrinho por outro modelo',()=>{
 const after=chooseVerifiedCart('Pix',prior,[cokeLine],catalog);
 assert.deepEqual(after.accepted.cart,prior.cart);assert.equal(after.rejectedEdit,false);
});
test('modelo não pode remover salgados quando cliente pede churros',()=>{
 const after=chooseVerifiedCart('Acrescenta churros',prior,[cokeLine,{productId:'churros',quantity:1,extras:[]}],catalog);
 assert.equal(after.rejectedEdit,true);assert.deepEqual(after.accepted.cart,prior.cart);
});
test('cliente pode adicionar churros sem perder bebidas e salgados',()=>{
 const after=chooseVerifiedCart('Acrescenta churros',prior,[kitLine,cokeLine,{productId:'churros',quantity:1,extras:[]}],catalog);
 assert.equal(after.accepted.valid,true);assert.equal(after.accepted.cart.length,3);
});
test('cliente pode retirar apenas refrigerante sem perder salgados',()=>{
 const after=chooseVerifiedCart('Tira Coca-Cola 2 litros',prior,[kitLine],catalog);
 assert.equal(after.accepted.valid,true);assert.deepEqual(after.accepted.cart[0].extras,prior.cart[0].extras);
});
test('pergunta de preço não é autorização para remover itens',()=>{
 assert.equal(isCartEditMessage('Quanto custa a Coca-Cola 2 Litros?',catalog),false);
 const after=chooseVerifiedCart('Quanto custa a Coca-Cola 2 Litros?',prior,[kitLine],catalog);
 assert.deepEqual(after.accepted.cart,prior.cart);
});
test('cancelar pedido, limpar carrinho e cancelar tudo são ações explícitas',()=>{
 for(const message of ['Cancela pedido','Limpar carrinho','Cancelar tudo','Remove meu pedido'])
   assert.equal(isCancelEntireOrder(message),true,message);
});
test('recusar refrigerante não cancela todo pedido',()=>{
 for(const message of ['Não obrigado','Só isso','Sem churros','Não quero refrigerante'])
   assert.equal(isCancelEntireOrder(message),false,message);
});
test('bairro imaginado pela IA não vale como endereço',()=>{
 const previous={...EMPTY_DRAFT,fulfillment:'delivery'};
 const fabricated={...previous,neighborhood:'Santa Tereza',city:'Rio Grande da Serra',
   street:'Av São Paulo',number:'178'};
 const result=enrichAddressFromMessage('Quero entrega',previous,fabricated,catalog,false);
 assert.equal(result.neighborhood,'');assert.equal(result.street,'');assert.equal(result.number,'');
 const quote=quoteOrder(prior,{...result,paymentMethod:'cash',name:'Pedro'},catalog,{requirePhone:false});
 assert.equal(quote.deliveryFee,null);
});
test('número forjado pela IA não substitui o número realmente informado',()=>{
 const previous={...EMPTY_DRAFT,fulfillment:'delivery'};
 const fabricated={...previous,number:'123',neighborhood:'Santa Tereza'};
 const result=enrichAddressFromMessage('Santa Tereza, Av São Paulo 178',previous,fabricated,catalog,false);
 assert.equal(result.city,'Rio Grande da Serra');assert.equal(result.number,'178');
});
test('bairro correto não substitui cidade expressamente divergente',()=>{
 const original={...EMPTY_DRAFT,fulfillment:'delivery',city:'Ribeirão Pires'};
 const result=enrichAddressFromMessage('Santa Tereza, rua das Flores 44',original,original,catalog,true);
 assert.equal(result.city,'Ribeirão Pires');
 assert.equal(quoteOrder(prior,{...result,paymentMethod:'cash',name:'Pedro'},catalog,{requirePhone:false}).deliveryFee,null);
});
test('100 unidades de sabor único no carrinho não são bloqueadas',()=>{
 const result=validateCart([{productId:'kit',quantity:1,extras:[{extraId:'cox',quantity:100}]}],catalog);
 assert.equal(result.valid,true);
});
test('duas linhas repetidas do mesmo produto geram erro em vez de perda silenciosa',()=>{
 const result=validateCart([kitLine,kitLine],catalog);assert.equal(result.valid,false);
});
