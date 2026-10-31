const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function deliveryIds(items) {
 if (!Array.isArray(items) || !items.length || items.length>30) throw new Error('invalid_items')
 const ids=items.map(item=>typeof item==='string'?item:item?.id)
 if(ids.some(id=>typeof id!=='string'||!uuid.test(id))||new Set(ids).size!==ids.length)throw new Error('invalid_items')
 if(items.some(item=>typeof item==='object' && ((item.type && item.type!=='ORIGINAL') || (item.quantity && item.quantity!==1))))throw new Error('originals_only')
 return ids
}
export function deliveryAddress(input) {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('address_incomplete')
 const result={country:'MX'}
 for(const key of ['recipient','phone','street','exterior','interior','neighborhood','postal_code','municipality','state','notes']){
  const v=input[key];if(v!==undefined&&typeof v!=='string')throw new Error('address_invalid')
  result[key]=String(v||'').trim();if(result[key].length>(key==='notes'?1000:300))throw new Error('address_invalid')
 }
 for(const key of ['recipient','phone','street','exterior','neighborhood','postal_code','municipality','state'])if(!result[key])throw new Error('address_incomplete')
 if(!/^\d{5}$/.test(result.postal_code)||!/^\+?[0-9 ()-]{7,30}$/.test(result.phone))throw new Error('address_invalid')
 result.line1=`${result.street} ${result.exterior}${result.interior?' Int. '+result.interior:''}`;result.line2=result.neighborhood;result.city=result.municipality
 return result
}
export function deliveryKey(key){if(typeof key!=='string'||!uuid.test(key))throw new Error('invalid_key');return key}
export function deliveryError(code,t){const messages={auth_required:['Inicia sesión y confirma tu correo para continuar.','Sign in and confirm your email to continue.'],address_ineligible:['Entrega local disponible únicamente en el Área Metropolitana de Monterrey.','Local delivery is available only in the Monterrey Metropolitan Area.'],delivery_disabled:['El pago contra entrega aún no está habilitado.','Pay on delivery is not enabled yet.'],category_requires_review:['El estudio debe confirmar la categoría de entrega de esta obra.','The studio must confirm this artwork’s delivery category.'],slot_unavailable:['Este horario ya no es válido. Elige otro.','This appointment is no longer valid. Choose another.'],artwork_unavailable:['Una obra ya no está disponible.','An artwork is no longer available.'],stale_order:['El pedido cambió. Recarga antes de continuar.','The order changed. Reload before continuing.'],address_incomplete:['Completa destinatario, teléfono, calle, número exterior, colonia, código postal, municipio y estado.','Complete recipient, phone, street, exterior number, neighborhood, postal code, municipality and state.'],address_invalid:['Revisa el teléfono (solo números, mínimo 7) y que el código postal tenga 5 dígitos.','Check the phone (numbers only, at least 7) and that the postal code has 5 digits.'],payment_conflict:['Esta obra tiene una oferta o subasta pendiente.','This artwork has a pending offer or auction.'],network_error:['No hay conexión. Inténtalo de nuevo.','No connection. Please try again.'],order_lookup_failed:['El pedido no pudo registrarse en este momento. Inténtalo más tarde.','The order could not be registered right now. Please try later.']};const m=messages[code]||['No se pudo completar la operación. Revisa los datos e inténtalo de nuevo.','Could not complete the operation. Check the details and try again.'];return t(...m)}
