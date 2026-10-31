export function deliveryEventId(orderId){return 'jbu'+orderId.replaceAll('-','').toLowerCase()}
export function deliveryCalendarBody(order,items,siteUrl='https://www.josuebeltranuresti.com'){
 const address=order.shipping_address||{},en=order.delivery_locale==='en',titles=items.map(i=>i.title_snapshot).join(', ')
 return {id:deliveryEventId(order.id),summary:`${en?'Artwork Delivery':'Entrega de obra'} — ${titles}`.slice(0,500),visibility:'private',guestsCanInviteOthers:false,guestsCanModify:false,guestsCanSeeOtherGuests:false,
 start:{dateTime:order.delivery_start,timeZone:order.delivery_timezone},end:{dateTime:order.delivery_end,timeZone:order.delivery_timezone},
 location:[address.line1,address.line2,address.city,address.state,address.postal_code].filter(Boolean).join(', '),
 description:[`JBU — ${titles}`,`Order / Pedido: ${order.id}`,`Pay on delivery / Pago contra entrega: MXN ${order.total_amount_mxn}`,`Recipient / Destinatario: ${order.buyer_name}`,`Phone / Teléfono: ${order.buyer_phone||''}`,`Notes / Referencias: ${address.notes||''}`,order.status==='DELIVERED'?'Entrega completada / Delivery completed':'',new URL(`/orders/${order.id}`,siteUrl).href].filter(Boolean).join('\n'),
 attendees:[{email:order.buyer_email}],extendedProperties:{private:{jbu_order:order.id,jbu_revision:String(order.delivery_revision)}}}
}
// Injectable transport supports provider failure/timeout/idempotency tests without real invitations.
export async function syncDeliveryEvent(order,items,call,siteUrl){
 const body=deliveryCalendarBody(order,items,siteUrl),id=order.calendar_event_id||body.id
 const current=await call('GET',id)
 if(order.status==='CANCELLED'){
  if(current.status===404||current.status===410||current.data?.status==='cancelled')return {id,link:null}
  if(!current.ok)throw new Error(`calendar_${current.status}`)
  const result=await call('DELETE',id,null,'all');if(!result.ok&&![404,410].includes(result.status))throw new Error(`calendar_${result.status}`)
  return {id,link:null}
 }
 if(current.status===410||current.data?.status==='cancelled')throw new Error('calendar_event_deleted')
 if(current.status===404){
  const result=await call('POST',null,body,'all')
  if(result.status===409){const found=await call('GET',id);if(!found.ok)throw new Error(`calendar_${found.status}`);return syncDeliveryEvent({...order,calendar_event_id:id},items,call,siteUrl)}
  if(!result.ok)throw new Error(`calendar_${result.status}`)
  return {id:result.data.id,link:result.data.htmlLink||null}
 }
 if(!current.ok)throw new Error(`calendar_${current.status}`)
 const revision=Number(current.data?.extendedProperties?.private?.jbu_revision)
 if(revision>order.delivery_revision)throw new Error('calendar_stale_revision')
 if(revision===order.delivery_revision)return {id,link:current.data.htmlLink||null}
 const {id:unused,...update}=body
 const result=await call('PATCH',id,update,order.status==='DELIVERED'?'none':'all',current.data.etag)
 if(!result.ok)throw new Error(`calendar_${result.status}`)
 return {id,link:result.data.htmlLink||null}
}
