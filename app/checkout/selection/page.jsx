'use client'

import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {Button,InlineLoading,InlineNotification} from '@carbon/react'
import {useCart} from '@/context/CartContext'
import {useI18n} from '@/components/I18nProvider'
import {shippingCheckoutFetch} from '@/components/shipping/ShippingProvider'
import {authHeaders} from '@/lib/authHeaders'
import {shippingErrorText} from '@/lib/shippingCountries'

const storageKey='jbu_curated_selection'

async function registerRequests(selection,headers) {
  if(!selection.requests.length)return true
  try {
    const response=await fetch('/api/prints/space',{
      method:'POST',headers,body:JSON.stringify({country:selection.country,currency:selection.currency,requests:selection.requests,locale:selection.locale}),signal:AbortSignal.timeout(8000),
    })
    const result=await response.json()
    return response.ok && result.ok && !result.skipped
  } catch {
    return false
  }
}

async function prepareSelection(stageFineArtPrints) {
  const selection=JSON.parse(sessionStorage.getItem(storageKey) || 'null')
  if(!selection || (!selection.lines?.length && !selection.requests?.length))return {status:'empty'}
  const authorization=await authHeaders()
  if(!authorization.Authorization) {
    window.location.replace('/login?redirect='+encodeURIComponent('/checkout/selection'))
    return {status:'loading'}
  }
  const headers={'Content-Type':'application/json',...authorization}
  const {lines,country,currency,expectedAmounts}=selection
  const savedRequests=registerRequests(selection,headers)
  if(!lines.length)return {status:await savedRequests?'requested':'requestError'}
  const cartItems=await stageFineArtPrints(lines,country,currency)
  if(!cartItems)return {status:'checkoutError'}
  if(cartItems.some(line=>line.amountMinor!==expectedAmounts?.[line.variantId])) {
    return {status:'checkoutError',error:'catalog_price_changed'}
  }
  const response=await shippingCheckoutFetch('/api/checkout',{
    method:'POST',headers,body:JSON.stringify({cartItems,destination:country,currency}),
  })
  const result=await response.json()
  if(!response.ok || !result.url)return {status:'checkoutError',error:result.error}
  return {status:await savedRequests?'ready':'requestError',url:result.url}
}

function finishSelection(url) {
  sessionStorage.removeItem(storageKey)
  if(url)window.location.replace(url)
}

export default function SelectionCheckout() {
  const {t}=useI18n()
  const {stageFineArtPrints}=useCart()
  const latest=useRef(stageFineArtPrints)
  const intent=useRef(null)
  const [attempt,setAttempt]=useState(0)
  const [result,setResult]=useState({status:'loading'})
  useEffect(()=>{latest.current=stageFineArtPrints},[stageFineArtPrints])
  useEffect(()=>{
    let active=true
    if(intent.current?.attempt!==attempt) {
      intent.current={attempt,promise:prepareSelection(latest.current).catch(()=>({status:'checkoutError'}))}
    }
    intent.current.promise.then(next=>{
      if(!active)return
      if(next.status==='ready' || next.status==='requested')finishSelection(next.url)
      setResult(next)
    })
    return ()=>{active=false}
  },[attempt])

  const retry=()=>{
    setResult({status:'loading'})
    setAttempt(value=>value+1)
  }
  return <main style={{maxWidth:'48rem',marginInline:'auto',padding:'var(--cds-spacing-07)'}}>
    <h1>{t('Comprar selección','Buy selection')}</h1>
    {(result.status==='loading' || result.status==='ready') && <InlineLoading
      description={t('Preparando tu selección…','Preparing your selection…')} />}
    {result.status==='checkoutError' && <InlineNotification kind="error" lowContrast hideCloseButton
      title={t('No se pudo abrir el pago','Could not start payment')}
      subtitle={shippingErrorText(result.error,t) || t('Revisa los precios y el destino en el carrito.','Review pricing and destination in your cart.')} />}
    {result.status==='requestError' && <InlineNotification kind="warning" lowContrast hideCloseButton
      title={t('Quedaron solicitudes sin registrar','Some requests could not be saved')}
      subtitle={result.url ? t('Puedes pagar las piezas disponibles.','You can pay for the available pieces.') : undefined} />}
    {result.status==='requestError' && (result.url
      ? <Button onClick={()=>finishSelection(result.url)}>{t('Continuar al pago','Continue to payment')}</Button>
      : <Button onClick={retry}>{t('Reintentar solicitudes','Retry requests')}</Button>)}
    {result.status==='requested' && <p role="status">{t('Solicitudes registradas.','Requests submitted.')}</p>}
    {result.status==='empty' && <p>{t('No hay una selección pendiente.','There is no pending selection.')}</p>}
    {!['loading','ready'].includes(result.status) && <Button as={Link} href="/cart" kind="ghost">{t('Ver carrito','View cart')}</Button>}
  </main>
}
