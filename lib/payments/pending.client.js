import {authHeaders} from '@/lib/authHeaders'
export async function fetchPayment(artwork){
 const r=await fetch(`/api/pending-payment?artwork=${encodeURIComponent(artwork)}`,{headers:await authHeaders(),cache:'no-store'}),d=await r.json()
 if(!r.ok)throw new Error(d.error||'No se pudo consultar el pago pendiente.')
 return d.payment?{...d.payment,clock_offset:Date.parse(d.server_now)-Date.now()}:null
}
export async function payPending(payment){
 const r=await fetch('/api/pending-payment',{method:'POST',headers:{'Content-Type':'application/json',...await authHeaders()},body:JSON.stringify({source:payment.source,id:payment.id})}),d=await r.json()
 if(!r.ok||!d.url)throw new Error(d.error||'No se pudo iniciar el pago.')
 window.location.href=d.url
}
