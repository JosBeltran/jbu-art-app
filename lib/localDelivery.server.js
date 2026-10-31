import {serviceClient,getRequestUser} from './offersAuth.js'
import {deliveryConfig,getOrderDeliveryCategory,getAvailableSlots,isEligibleAddress,validateDeliverySelection} from './localDelivery.js'
import {deliveryIds,deliveryAddress,deliveryKey} from './localDeliveryInput.js'
import {getArtworkCommercePresentation} from './artworkCommerce.js'
import {isHomeEligible} from './homeSeries.js'
import {syncDeliveryEvent} from './deliveryCalendar.js'
import {deliverNotificationEmails} from './notifications.server.js'
import {recordArtworkSold} from './provenance.js'
import {randomUUID} from 'node:crypto'
export async function deliveryAdmin(request,db){const user=await getRequestUser(request,db);if(!user)throw new Error('auth_required');const r=await db.from('user_roles').select('role').eq('user_id',user.id).eq('role','admin').limit(1);if(r.error)throw new Error('roles_unavailable');if(!r.data?.length)throw new Error('forbidden');return user}
export async function loadDeliveryConfig(db){const r=await db.from('site_settings').select('local_delivery').eq('id',true).single();if(r.error)throw new Error('delivery_unconfigured');return deliveryConfig(r.data.local_delivery)}
export async function deliveryQuote(db,body){
 const ids=deliveryIds(body.items),config=await loadDeliveryConfig(db)
 if(!config.enabled||!config.paymentOnDeliveryEnabled)return {config,eligible:false,reason:'delivery_disabled',slots:[]}
 const r=await db.from('artworks').select('*').in('id',ids);if(r.error||r.data?.length!==ids.length)throw new Error('artwork_unavailable')
 const series=await db.from('series').select('*');if(series.error)throw new Error('catalog_unavailable')
 if(r.data.some(a=>a.status!=='AVAILABLE'||a.current_owner_id||a.pending_owner_id||a.reserved_order_id||!getArtworkCommercePresentation(a).showAdd||!isHomeEligible(a,series.data)))throw new Error('artwork_unavailable')
 const category=getOrderDeliveryCategory(r.data),eligible=isEligibleAddress({...body.address,country:body.address?.country||'MX'},config)
 const [auctions,offers]=await Promise.all([db.from('auctions').select('id').in('artwork_id',ids).or('status.in.(UPCOMING,LIVE),and(status.eq.SOLD,payment_status.eq.PENDING)').limit(1),db.from('artwork_offers').select('id').in('artwork_id',ids).eq('status','ACCEPTED').eq('payment_status','PENDING').gt('payment_due_at',new Date().toISOString()).limit(1)])
 if(auctions.error||offers.error)throw new Error('availability_unavailable');if(auctions.data?.length||offers.data?.length)throw new Error('payment_conflict')
 return {config,category,eligible,reason:eligible?null:'address_ineligible',total:r.data.reduce((sum,a)=>sum+Number(a.base_price_mxn||a.calculated_price_mxn),0),artworks:r.data.map(a=>({id:a.id,title:a.title,sku:a.sku,primary_image_url:a.primary_image_url})),slots:eligible?getAvailableSlots({category,now:new Date().toISOString(),date:body.date,config}):[]}
}
export async function syncOrderCalendar(db,id){
 const lease=randomUUID(),locked=await db.rpc('lease_delivery_calendar',{_order:id,_lease:lease});if(locked.error)throw new Error('calendar_order_unavailable');if(!locked.data)return {pending:true}
 const order=locked.data
 try{
  const key=process.env.GOOGLE_CALENDAR_API_KEY,lovable=process.env.LOVABLE_API_KEY;if(!key||!lovable)throw new Error('calendar_not_configured')
  const calendar=process.env.JBU_DELIVERY_CALENDAR_ID||'primary'
  const base=`https://connector-gateway.lovable.dev/google_calendar/calendar/v3/calendars/${encodeURIComponent(calendar)}/events`
  const items=await db.from('order_items').select('title_snapshot').eq('order_id',id);if(items.error)throw new Error('calendar_items_unavailable')
  const call=async(method,event,body,updates,etag)=>{const url=new URL(base+(event?'/'+encodeURIComponent(event):''));if(updates)url.searchParams.set('sendUpdates',updates);const response=await fetch(url,{method,headers:{Authorization:`Bearer ${lovable}`,'X-Connection-Api-Key':key,'Content-Type':'application/json',...(etag?{'If-Match':etag}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});const text=await response.text();let data;try{data=JSON.parse(text)}catch{};if(!response.ok&&![404,409,410].includes(response.status))console.error('[delivery] Calendar provider failure',{status:response.status,code:data?.error?.code});return {ok:response.ok,status:response.status,data}}
  const event=await syncDeliveryEvent(order,items.data||[],call,process.env.NEXT_PUBLIC_SITE_URL)
  const saved=await db.rpc('finish_delivery_calendar',{_order:id,_lease:lease,_revision:order.delivery_revision,_event:event.id,_link:event.link,_error:null});if(saved.error||!saved.data)throw new Error('calendar_readback_failed')
  return event
 }catch(error){const safe=/^calendar_[a-z0-9_]+$/.test(error.message)?error.message:'calendar_sync_failed';const saved=await db.rpc('finish_delivery_calendar',{_order:id,_lease:lease,_revision:order.delivery_revision,_event:null,_link:null,_error:safe});if(saved.error)console.error('[delivery] failed status not persisted');return {error:safe}}
}
export async function deliveryEffects(db,id){
 const o=await db.from('orders').select('*').eq('id',id).single();if(o.error)throw new Error('order_readback_failed')
 if(o.data.payment_status==='PAID'){const items=await db.from('order_items').select('artwork_id').eq('order_id',id);for(const item of items.data||[])await recordArtworkSold({artworkId:item.artwork_id,orderId:id,paymentMethod:'payment_on_delivery'},db)}
 await Promise.allSettled([syncOrderCalendar(db,id),deliverNotificationEmails(db,id)]);return o.data
}
export async function createDelivery(request,body){const db=serviceClient(),user=await getRequestUser(request,db);if(!user)throw new Error('auth_required');const ids=deliveryIds(body.items),address=deliveryAddress(body.address),key=deliveryKey(body.key);const existing=await db.from('orders').select('id').eq('buyer_user_id',user.id).eq('local_delivery_key',key).maybeSingle();if(existing.error)throw new Error('order_lookup_failed');if(existing.data){await deliveryEffects(db,existing.data.id);return {id:existing.data.id}}const quote=await deliveryQuote(db,{...body,address});if(!quote.eligible)throw new Error(quote.reason);validateDeliverySelection({category:quote.category,now:new Date().toISOString(),start:body.start,end:body.end,config:quote.config});const result=await db.rpc('create_local_delivery_order',{_user:user.id,_key:key,_ids:ids,_address:address,_start:body.start,_end:body.end,_locale:body.locale==='en'?'en':'es'});if(result.error)throw new Error(result.error.message);await deliveryEffects(db,result.data);return {id:result.data}}
export function deliveryResponseError(error){const message=String(error.message||'internal_error');const code=/^[a-z][a-z0-9_]{0,80}$/.test(message)?message:'invalid_input';const status=code==='auth_required'?401:code==='forbidden'?403:/unconfigured|unavailable$|roles_unavailable/.test(code)?503:409;console.error('[delivery] operation failed',{code,detail:String(error?.message||'').slice(0,500)});return Response.json({error:code},{status,headers:{'Cache-Control':'no-store'}})}
