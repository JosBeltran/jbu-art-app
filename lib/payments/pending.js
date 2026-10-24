// Shared projection of the existing auction winner payment state; no sale entity.
export function paymentFrom(source, row) {
 if (!row || (source === 'OFFER' ? row.status !== 'ACCEPTED' : row.status !== 'SOLD' || row.sale_type !== 'BID')) return null
 return {source,id:row.id,artwork_id:row.artwork_id,buyer_id:source==='OFFER'?row.user_id:row.winner_id,
 amount:Number(source==='OFFER'?row.offer_amount_mxn:row.winning_amount??row.current_bid),payment_status:row.payment_status,payment_due_at:row.payment_due_at}
}
export function paymentState(p,userId,now=Date.now()) {
 if(!p||!userId||p.buyer_id!==userId)return 'NONE'
 if(p.payment_status==='PAID')return 'PAID'
 const due=Date.parse(p.payment_due_at)
 if(p.payment_status==='EXPIRED'||Number.isFinite(due)&&due<=now)return 'EXPIRED'
 return p.payment_status==='PENDING'&&Number.isFinite(due)&&Number.isFinite(p.amount)&&p.amount>0?'PENDING':'NONE'
}
export function phase(a,now=Date.now()) {
 return ['LIVE','UPCOMING'].includes(a?.status)&&Date.parse(a.ends_at)<=now?'ENDED':a?.status
}
export function offerIdentity(user,email){return {user_id:user?.id||null,guest_email:String(user?.email||email||'').trim().toLowerCase()}}
