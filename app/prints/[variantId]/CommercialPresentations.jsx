'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Button, Select, SelectItem } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { useMarket } from '@/components/market/MarketProvider'
import { useCurrency } from '@/components/CurrencyProvider'
import ShippingBenefit from '@/components/shipping/ShippingBenefit'
import { useShipping } from '@/components/shipping/ShippingProvider'
import { useCart } from '@/context/CartContext'
import OptimizedImg from '@/components/media/OptimizedImg'
import WallArtMockup from '@/components/admin/productCatalog/WallArtMockup'
import { customerPrintChoices, customerPrintLabel, customerPrintOptions, printChoiceOrder, resolveCustomerPrint } from '@/lib/productCatalog/customerPrintConfiguration'
import { catalogMoney, fineArtLineType, marketVariant, marketChoices } from '@/lib/productCatalog/commerce'
import styles from './CommercialPresentations.module.css'

const labels = {
  paper:['Papel o material','Paper or material'],
  framing:['Presentación','Presentation'],
  frame_material:['Tipo de marco','Frame material'],
  frame_color:['Color del marco','Frame colour'],
  size:['Tamaño','Size'],
}

export default function CommercialPresentations({ variants, title, titleEn, initialId, country: initialCountry, preview = false }) {
  const { t, locale } = useI18n()
  const { country, setCountry, ready } = useMarket()
  const { globalCountries } = useShipping()
  const { chargeCurrency } = useCurrency()
  const { addToCart } = useCart()
  const activeCountry = country || (!ready ? initialCountry : null)
  const [id, setId] = useState(initialId)
  const [photo, setPhoto] = useState(null)
  const [status, setStatus] = useState(null)
  const dialog = useRef(null)
  const available = marketChoices(variants,activeCountry,chargeCurrency,preview)
  const preferred = variants.find(row=>row.id===id)
  const selected = available.find(row=>row.id===id) || available[0]
  const shown = selected || preferred || variants[0]
  if (!shown) return null
  const price = selected && marketVariant(selected,activeCountry,chargeCurrency)
  const choices = customerPrintChoices(shown)
  const images = shown.gallery
  const image = images.find(entry=>photo?.id===shown.id && entry.url===photo.url) || images[0]
  const countryNames = new Intl.DisplayNames([locale],{ type:'region' })
  const artworkTitle = t(title,titleEn || title)
  const selectionKey = JSON.stringify([shown.id,activeCountry,chargeCurrency])
  const feedback = status?.key===selectionKey ? status.state : null
  const priceText = price ? catalogMoney(price.amountMinor,price.currency,locale)
    : activeCountry ? t('Sin precio disponible para este mercado','Unavailable in this market')
      : t('Selecciona tu destino para consultar el precio','Select your destination to see the price')
  const attributes = Object.fromEntries((shown.attributes || []).map(({code,value})=>[code,value]))
  const appearance = { ...shown.previewGeometry, attributes:{...attributes, frame_material:choices.frame_material, frame_color:choices.frame_color} }
  const illustration = image?.illustration && appearance.widthMm>0 && appearance.heightMm>0

  function select(field,value) {
    const next = resolveCustomerPrint(available,shown,field,value)
    if (next) { setId(next.id);setPhoto(null);setStatus(null) }
  }

  async function add() {
    if (!selected || !price || preview || feedback==='adding') return
    setStatus({key:selectionKey,state:'adding'})
    try {
      const added = await addToCart({ id:selected.artworkId, variantId:selected.id, quantity:1, type:fineArtLineType,
        destination:activeCountry, currency:price.currency })
      setStatus(previous=>previous?.key===selectionKey ? {key:selectionKey,state:added ? 'added' : 'failed'} : previous)
    } catch {
      setStatus(previous=>previous?.key===selectionKey ? {key:selectionKey,state:'failed'} : previous)
    }
  }

  const summary = printChoiceOrder.filter(field=>choices[field])
    .map(field=>customerPrintLabel(field,choices[field],t)).join(' · ')

  return <section className={styles.shell} aria-label={t('Presentaciones de arte mural','Wall art presentations')}>
    <div className={styles.gallery}>
      {image && <button type="button" className={styles.expand} aria-label={t('Ampliar vista del print','Enlarge print preview')} onClick={()=>dialog.current?.showModal()}>
        {illustration
          ? <WallArtMockup image={image.url} alt={artworkTitle} variant={appearance} fit={appearance.fit==='cover' ? 'cover' : 'contain'} scene={appearance.scene} borderMm={appearance.borderMm} framed={choices.framing==='framed'} />
          : <OptimizedImg key={image.url} src={image.url} alt={t(image.altEs,image.altEn)} priority sizes="(max-width: 700px) 100vw, 50vw" />}
      </button>}
      {image?.illustration && <p className={styles.caption}>{t('Vista ilustrativa de la configuración','Illustrative configuration preview')}</p>}
      {images.length > 1 && <div className={styles.thumbnails}>{images.map(entry =>
        <button type="button" key={entry.url} aria-pressed={image?.url===entry.url} onClick={()=>setPhoto({id:shown.id,url:entry.url})}>
          <OptimizedImg src={entry.url} alt={t(entry.altEs,entry.altEn)} sizes="80px" />
        </button>)}</div>}
      {image && <dialog ref={dialog} className={styles.dialog} aria-label={t('Vista ampliada','Enlarged preview')}>
        <form method="dialog"><Button type="submit" kind="ghost" size="sm">{t('Cerrar','Close')}</Button></form>
        {illustration
          ? <WallArtMockup image={image.url} alt={artworkTitle} variant={appearance} fit={appearance.fit==='cover' ? 'cover' : 'contain'} scene={appearance.scene} borderMm={appearance.borderMm} framed={choices.framing==='framed'} />
          : <OptimizedImg src={image.url} alt={t(image.altEs,image.altEn)} sizes="85vw" />}
      </dialog>}
    </div>
    <div className={styles.options}>
      <h1>{artworkTitle}</h1>
      {!preview && shown.artworkSku && <Link href={'/artwork/' + encodeURIComponent(shown.artworkSku)}>
        {t('Ver obra','View artwork')}</Link>}
      <div className={styles.choices}>
        {selected && printChoiceOrder.map(field=>{
          const values=customerPrintOptions(available,selected,field)
          if(values.length<2) return null
          return <Select key={field} id={'fine-art-choice-'+field} labelText={t(...labels[field])}
            value={choices[field]} onChange={event=>select(field,event.target.value)}>
            {values.map(value=><SelectItem key={value} value={value} text={customerPrintLabel(field,value,t)} />)}
          </Select>
        })}
      </div>
      {summary && <p className={styles.summary}>{summary}</p>}
      <Select id="fine-art-country" labelText={t('País de entrega','Delivery country')} value={activeCountry || ''}
        disabled={preview} onChange={event=>{setCountry(event.target.value || null);setStatus(null)}}>
        <SelectItem value="" text={t('Seleccionar','Select')} />
        {(globalCountries || []).map(code=><SelectItem key={code} value={code} text={countryNames.of(code)} />)}
      </Select>
      {!preview && price && <ShippingBenefit
        item={{id:selected.id,type:fineArtLineType,allowed_shipping_countries:[activeCountry],
          artwork:{allowed_shipping_countries:selected.countries,shipping_policy_ids:selected.shippingPolicyIds}}}
        destination={activeCountry} artwork={{id:selected.artworkId,sku:selected.artworkSku,title:artworkTitle}} />}
      {t(shown.description,shown.descriptionEn) && <details className={styles.specifications}>
        <summary>{t('Sobre esta presentación','About this presentation')}</summary>
        <p>{t(shown.description,shown.descriptionEn)}</p>
      </details>}
      {feedback==='added' && <p role="status">{t('Agregado al carrito','Added to cart')}</p>}
      {feedback==='failed' && <p role="alert">{t('No se pudo agregar el print. Revisa el país y la moneda.','Could not add the print. Check the country and currency.')}</p>}
      <div className={styles.purchase}>
        <p aria-live="polite">{priceText}</p>
        <Button disabled={preview || !price || feedback==='adding'} onClick={add}>{t('Agregar al carrito','Add to cart')}</Button>
      </div>
    </div>
  </section>
}
