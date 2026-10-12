import 'server-only';
import { createClient } from '@supabase/supabase-js';

export type Option={id:string;name:string;price:number};
export type Group={id:string;name:string;required:boolean;multiple_selection:boolean;min_select:number;max_select:number|null;options:Option[]};
export type Product={id:string;name:string;description:string|null;price:number;group:Group[]};
export type Zone={city:string|null;neighborhood:string;fee:number};
export type Catalog={ready:boolean;error?:string;store:string;open:boolean|null;products:Product[];zones:Zone[];settings:Record<string,unknown>};
const missing:Catalog={ready:false,store:'Ki Delícia Salgados',open:null,products:[],zones:[],settings:{}};
export async function loadCatalog():Promise<Catalog> {
  const url=process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !key)return {...missing,error:'Falta conectar o Supabase da Ki Delícia.'};
  try {
    // As sete consultas são apenas leitura. NÃO cria pedidos, cobranças nem clientes.
    const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const [s,p,g,e,l,z]=await Promise.all([
      db.from('settings').select('store_name,is_open,opening_hours,average_preparation_time,minimum_order,minimum_order_delivery,minimum_order_pickup,accept_delivery,accept_pickup,accept_pix,accept_cash,accept_debit,accept_credit,whatsapp').limit(1).maybeSingle(),
      db.from('products').select('id,name,description,price').eq('active',true).order('sort_order',{ascending:true}).limit(400),
      db.from('extra_groups').select('id,name,required,multiple_selection,min_select,max_select').eq('active',true),
      db.from('extras').select('id,group_id,name,price').eq('active',true),
      db.from('product_extra_groups').select('product_id,extra_group_id'),
      db.from('delivery_zones').select('city,neighborhood,fee').eq('active',true)
    ]);
    const errors=[s,p,g,e,l,z].filter(x=>x.error).map(x=>x.error?.message);
    if(errors.length)throw new Error(errors.join('; '));
    const options=new Map<string,Option[]>();
    for(const o of e.data||[])options.set(o.group_id,[...(options.get(o.group_id)||[]),{id:o.id,name:o.name,price:Number(o.price)}]);
    const groups=new Map<string,Group>();
    for(const x of g.data||[])groups.set(x.id,{id:x.id,name:x.name,required:Boolean(x.required),multiple_selection:Boolean(x.multiple_selection),min_select:Number(x.min_select||0),max_select:x.max_select===null?null:Number(x.max_select),options:options.get(x.id)||[]});
    const groupsByProduct=new Map<string,Group[]>();
    for(const x of l.data||[]){const group=groups.get(x.extra_group_id);if(group)groupsByProduct.set(x.product_id,[...(groupsByProduct.get(x.product_id)||[]),group]);}
    const products:Product[]=(p.data||[]).map(x=>({id:x.id,name:x.name,description:x.description,price:Number(x.price),group:groupsByProduct.get(x.id)||[]}));
    const settings:Record<string,unknown>=s.data||{};
    return {ready:true,store:String(settings.store_name||'Ki Delícia Salgados'),open:typeof settings.is_open==='boolean'?settings.is_open:null,settings,products,zones:(z.data||[]).map(x=>({city:x.city,neighborhood:x.neighborhood,fee:Number(x.fee)}))};
  }catch(err){console.error('Falha no catálogo Ki Delícia:',err instanceof Error?err.message:'erro');return {...missing,error:'Não consegui ler o cardápio do Supabase. Verifique URL, chave e permissões.'};}
}
