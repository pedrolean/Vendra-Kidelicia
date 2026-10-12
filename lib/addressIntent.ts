import type { Catalog } from './catalog';
import { inferCityFromZones, type Draft } from './checkout.ts';

function normalize(text:string){
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function includesPhrase(haystack:string,needle:string){
  const phrase=normalize(needle);
  return !!phrase && (' '+normalize(haystack)+' ').includes(' '+phrase+' ');
}
/**
 * Reads ONLY the customer message. Never trusts an AI-generated city/bairro
 * that conflicts with the live registered delivery zones.
 */
export function enrichAddressFromMessage(
  message:string, previous:Draft, draft:Draft,catalog:Catalog,explicitCity:boolean
):Draft{
  const fulfillment=draft.fulfillment||previous.fulfillment;
  if(fulfillment!=='delivery')return draft;
  const found=catalog.zones
    .filter(zone=>zone.neighborhood&&includesPhrase(message,zone.neighborhood))
    .sort((a,b)=>b.neighborhood.length-a.neighborhood.length);
  const zone=found[0];
  const next={...draft};
  // A language-model guess is not evidence of an address. Only accept
  // fields already confirmed previously or actually present in the message.
  if(next.neighborhood!==previous.neighborhood &&
      !zone&&!includesPhrase(message,next.neighborhood))next.neighborhood=previous.neighborhood;
  if(next.street!==previous.street&&!includesPhrase(message,next.street))next.street=previous.street;
  if(next.number!==previous.number&&(!/^\d{1,6}[a-z]?$/i.test(next.number)||!includesPhrase(message,next.number)))next.number=previous.number;
  if(!explicitCity&&next.city!==previous.city)next.city=previous.city;
  if(zone){
    // Preserve canonical neighborhood spelling. The city is inferred only if
    // there is exactly one city for this registered neighborhood.
    next.neighborhood=zone.neighborhood;
  }
  const match=message.match(/(?:^|[,\s;])((?:avenida|av\.?|rua|r\.?|travessa|tv\.?|estrada|rodovia|alameda|praça|praca|largo)\s+[^,\n]+?)[\s,]+(?:n[º°o]?\s*)?(\d{1,6}[a-z]?)(?=$|[\s,;.])/i);
  if(match){
    next.street=match[1].trim().replace(/[.,;]+$/,'');
    next.number=match[2];
  }
  return inferCityFromZones(next,catalog,explicitCity);
}
