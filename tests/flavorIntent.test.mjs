import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMixedFlavorIntent } from '../lib/flavorIntent.ts';

const names = ['QUEIJO','CARNE','RISOLE','COXINHA','CALABRESA','SALSICHA'];
const group = {
  id:'g', name:'SABORES DOS SALGADOS', required:true,
  multiple_selection:true, min_select:0, max_select:null,
  options:names.map((name,index)=>({id:String(index),name,price:0}))
};
const catalog = { products:[{id:'30',name:'SALGADOS 30 UNIDADES',category:'Salgados',
  price:30,description:null,group:[group]}] };
const u = (content)=>({role:'user',content});
const resolve = (...content)=>resolveMixedFlavorIntent(content.map(u),catalog,[]);
test('cliente quer 30 salgados sem sabores ainda: perguntar',()=>{
  assert.equal(resolve('Quero 30 salgados'),null);
});
test('30 salgados misto menos salsicha = cinco sabores, seis de cada',()=>{
  const r=resolve('Quero 30 salgados','Misto menos salsicha');
  assert.ok(r); assert.equal(r.cart.length,1);
  assert.deepEqual(r.cart[0].extras.map(e=>e.quantity),[6,6,6,6,6]);
  assert.ok(r.cart[0].extras.every(e=>e.extraId!=='5'));
  assert.match(r.reply,/salsicha/);
});
test('todos menos o de salsicha mantém mistura sem exclusão revertida',()=>{
  const r=resolve('Quero 30 salgados','Misto menos salsicha','Todos menos o de salsicha');
  assert.ok(r); assert.equal(r.cart[0].extras.length,5);
  assert.equal(r.cart[0].extras.reduce((v,e)=>v+e.quantity,0),30);
});
test('lista de 5 sabores do print divide em 6 unidades cada',()=>{
  const r=resolve('Quero 30 salgados','Misto menos salsicha',
    'Todos menos o de salsicha','Risole coxinha carne calabresa e queijo');
  assert.ok(r); assert.equal(r.cart[0].extras.length,5);
  assert.ok(r.cart[0].extras.every(e=>e.quantity===6&&e.extraId!=='5'));
});
test('misto só de coxinha e risole divide 15 + 15',()=>{
  const r=resolve('Quero 30 salgados','Misto só de coxinha e risole');
  assert.ok(r); assert.deepEqual(r.cart[0].extras.map(e=>e.quantity),[15,15]);
});
test('não troca por pacote de quantidade diferente',()=>{
  const different={products:[{...catalog.products[0],name:'SALGADOS 50 UNIDADES'}]};
  assert.equal(resolveMixedFlavorIntent([u('Quero 30 salgados'),u('misto')],different,[]),null);
});
test('não escolhe entre dois kits ambíguos',()=>{
  const ambiguous={products:[...catalog.products,{...catalog.products[0],id:'outro'}]};
  assert.equal(resolveMixedFlavorIntent([u('Quero 30 salgados'),u('misto')],ambiguous,[]),null);
});
test('não modifica bebida já adicionada',()=>{
  const previous=[{productId:'refrigerante',quantity:2,extras:[]}];
  const r=resolveMixedFlavorIntent([u('Quero 30 salgados'),u('Misto menos salsicha')],catalog,previous);
  assert.ok(r); assert.deepEqual(r.cart[0],previous[0]); assert.equal(r.cart.length,2);
});
test('não duplica o pacote de 30 se já está no carrinho',()=>{
  const previous=[{productId:'30',quantity:1,extras:[{extraId:'3',quantity:30}]}];
  const r=resolveMixedFlavorIntent([u('Quero 30 salgados'),u('Misto menos salsicha')],catalog,previous);
  assert.ok(r); assert.equal(r.cart.length,1); assert.equal(r.cart[0].extras.length,5);
});
test('mensagem posterior de pagamento não altera os sabores',()=>{
  assert.equal(resolve('Quero 30 salgados','Misto menos salsicha','Vou pagar com Pix'),null);
});
test('menção isolada de sabor excluído não reverte exclusão',()=>{
  assert.equal(resolve('Quero 30 salgados','Misto menos salsicha','Salsicha'),null);
});
