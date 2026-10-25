import {paymentFrom,paymentState} from './pending.js'
export async function refreshPayments(db,user){
 if(user?.email_confirmed_at){const r=await db.rpc('link_verified_offers',{_user:user.id});if(r.error)throw new Error('No se pudieron vincular tus ofertas; falta la actualización 20261102.')}
 const r=await db.rpc('refresh_pending_payments');if(r.error)throw new Error('No se pudieron comprobar los vencimientos; falta la actualización 20261102.')
}
export async function artworkPayment(db,user,artwork){
 await refreshPayments(db,user)
 const a=await db.from('auctions').select('*').eq('artwork_id',artwork).eq('winner_id',user.id).eq('status','SOLD').eq('sale_type','BID').order('ends_at',{ascending:false}).limit(1)
 const o=await db.from('artwork_offers').select('*').eq('artwork_id',artwork).eq('user_id',user.id).eq('status','ACCEPTED').order('accepted_at',{ascending:false}).limit(1)
 if(a.error||o.error)throw new Error('No se pudo consultar el pago pendiente.')
 const choices=[paymentFrom('AUCTION',a.data?.[0]),paymentFrom('OFFER',o.data?.[0])].filter(Boolean)
 return choices.find(p=>paymentState(p,user.id)==='PENDING')||choices[0]||null
}
