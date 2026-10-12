import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY_DRAFT,inferCityFromZones,quoteOrder} from '../lib/checkout.ts';
import {validateCart} from '../lib/cart.ts';
import {safeCheckoutReply} from '../lib/checkoutDialogue.ts';
import {upsellOptions,makeUpsellText,isUpsellDecline,isVagueUpsellYes} from '../lib/upsell.ts';
import {resolveMixedFlavorIntent} from '../lib/flavorIntent.ts';
const flavors=['QUEIJO','CARNE','RISOLE','COXINHA','CALABRESA','SALSICHA'];
const products=[
 {id:'kit',name:'SALGADOS 50 UNIDADES',category:'Salgados',description:null,price:43,
  group:[{id:'g',name:'SABORES DOS SALGADOS',required:true,multiple_selection:true,min_select:0,max_select:null,
   options:flavors.map((name,index)=>({id:String(index),name,price:0}))}]},
 {id:'coca',name:'COCA-COLA 2 LITROS',category:'Bebidas',description:null,price:16,group:[]},
 {id:'guarana',name:'GUARANÁ ANTARCTICA 600ML',category:'Bebidas',description:null,price:8,group:[]},
 {id:'churros',name:'10 CHURROS CHOCOLATE',category:'Churros',description:null,price:12,group:[]},
 {id:'coxinha_avulsa',name:'COXINHA AVULSA',category:'Salgados',description:null,price:3,group:[]}
];
const schedule=Array.from({length:7},(_,day)=>({day,enabled:true,open:'00:00',close:'00:00'}));
const catalog={products,zones:[
 {city:'Rio Grande da Serra',neighborhood:'Santa Tereza',fee:6},
 {city:'Ribeirão Pires',neighborhood:'Centro',fee:9}
 ],settings:{is_open:true,business_hours:schedule,accept_delivery:true,accept_pickup:true,
 accept_pix:true,accept_cash:true,accept_debit:true,accept_credit:true,
 minimum_order:0,minimum_order_delivery:0,minimum_order_pickup:0}};
const item={productId:'kit',quantity:1,extras:[{extraId:'0',quantity:10},{extraId:'1',quantity:10},{extraId:'2',quantity:10},{extraId:'4',quantity:10},{extraId:'5',quantity:10}]};
const checked=validateCart([item],catalog);
const routeDraft={...EMPTY_DRAFT,name:'',fulfillment:'delivery',
 neighborhood:'Santa Tereza',street:'Av São Paulo',number:'178',paymentMethod:'cash'};
test('bairro Santa Tereza permite inferir Rio Grande da Serra',()=>{
 const result=inferCityFromZones(routeDraft,catalog);
 assert.equal(result.city,'Rio Grande da Serra');
 const q=quoteOrder(checked,result,catalog,{requirePhone:false});
 assert.equal(q.deliveryFee,6);assert.equal(q.total,49);
});
test('bairro Centro permite inferir Ribeirão Pires',()=>{
 const result=inferCityFromZones({...routeDraft,neighborhood:'Centro'},catalog);
 assert.equal(result.city,'Ribeirão Pires');
});
test('bairro homônimo não permite inventar cidade',()=>{
 const c={...catalog,zones:[...catalog.zones,{city:'Ribeirão Pires',neighborhood:'Santa Tereza',fee:5}]};
 assert.equal(inferCityFromZones(routeDraft,c).city,'');
});
test('cidade que o cliente informou explicitamente não é substituída',()=>{
 const result=inferCityFromZones({...routeDraft,city:'Ribeirão Pires'},catalog,true);
 assert.equal(result.city,'Ribeirão Pires');
 assert.equal(quoteOrder(checked,result,catalog,{requirePhone:false}).deliveryFee,null);
});
test('cidade inferida é atualizada quando bairro muda sem cidade explícita',()=>{
 const result=inferCityFromZones({...routeDraft,city:'Rio Grande da Serra',neighborhood:'Centro'},catalog,false);
 assert.equal(result.city,'Ribeirão Pires');
});
test('o laboratório não precisa solicitar telefone automaticamente',()=>{
 const draft=inferCityFromZones(routeDraft,catalog);
 const q=quoteOrder(checked,draft,catalog,{requirePhone:false});
 assert.equal(q.issues.includes('Informar o WhatsApp com DDD.'),false);
 assert.ok(q.issues.includes('Informar o nome.'));
});
test('checkout passa a perguntar nome ao final',()=>{
 const draft={...inferCityFromZones(routeDraft,catalog),upsellStatus:'declined'};
 const q=quoteOrder(checked,draft,catalog,{requirePhone:false});
 const message=safeCheckoutReply({text:'dinheiro',previous:EMPTY_DRAFT,draft,cart:checked,quote:q,catalog});
 assert.equal(message,'Para concluir a simulação, qual é seu nome?');
});
test('só oferece valores do cardápio ativo',()=>{
 const options=upsellOptions(checked,catalog);
 assert.deepEqual(options.map(x=>x.id),['guarana','coca','churros']);
 const text=makeUpsellText(options).replace(/\u00a0/g,' ');
 assert.match(text,/R\$ 8,00/);assert.match(text,/R\$ 16,00/);assert.match(text,/R\$ 12,00/);
});
test('oferta não se repete depois de incluir refrigerante',()=>{
 const added=validateCart([item,{productId:'coca',quantity:1,extras:[]}],catalog);
 assert.deepEqual(upsellOptions(added,catalog),[]);
});
test('oferta não se repete depois de incluir churros',()=>{
 const added=validateCart([item,{productId:'churros',quantity:1,extras:[]}],catalog);
 assert.deepEqual(upsellOptions(added,catalog),[]);
});
test('se não há bebidas/churros cadastrados não inventa produto',()=>{
 const limited={...catalog,products:catalog.products.filter(p=>!['coca','guarana','churros'].includes(p.id))};
 assert.deepEqual(upsellOptions(validateCart([item],limited),limited),[]);
});
test('resposta sem adicionais encerra oferta',()=>{
 assert.equal(isUpsellDecline('Não, obrigado'),true);
 assert.equal(isUpsellDecline('Só isso'),true);
 assert.equal(isUpsellDecline('Quero uma coca'),false);
});
test('sim sem produto especificado exige escolha e não inventa um item',()=>{
 assert.equal(isVagueUpsellYes('Sim'),true);
 assert.equal(isVagueUpsellYes('Quero Coca-Cola 2L'),false);
});
test('pedido inteiro numa mensagem distribui mistos menos coxinha',()=>{
 const r=resolveMixedFlavorIntent([{role:'user',content:'Boa tarde quero 50 salgados mistos menos coxinha'}],catalog,[]);
 assert.ok(r); assert.equal(r.cart.length,1);
 assert.equal(r.cart[0].extras.length,5);
 assert.equal(r.cart[0].extras.reduce((v,e)=>v+e.quantity,0),50);
 assert.ok(r.cart[0].extras.every(e=>e.extraId!=='3'));
});
test('oferecimento acontece antes de perguntar nome',()=>{
 const draft={...inferCityFromZones(routeDraft,catalog),upsellStatus:'offered'};
 const q=quoteOrder(checked,draft,catalog,{requirePhone:false});
 const message=safeCheckoutReply({text:'dinheiro',previous:EMPTY_DRAFT,draft,cart:checked,quote:q,catalog});
 assert.match(message,/refrigerante ou churros/i);assert.doesNotMatch(message,/qual é seu nome/i);
});
