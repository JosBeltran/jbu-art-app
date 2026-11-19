'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button, Select, SelectItem } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { useMarket } from '@/components/market/MarketProvider'
import { useCurrency } from '@/components/CurrencyProvider'
import ShippingBenefit from '@/components/shipping/ShippingBenefit'
import { useShipping } from '@/components/shipping/ShippingProvider'
import { useCart } from '@/context/CartContext'
import OptimizedImg from '@/components/media/OptimizedImg'
import { catalogMoney, fineArtLineType, marketVariant } from '@/lib/productCatalog/commerce'
import styles from './CommercialPresentations.module.css'

export default function CommercialPresentations({ variants, title, initialId, country: initialCountry, preview = false }) {
  const { t, locale } = useI18n()
  const { country, setCountry, ready } = useMarket()
  const { globalCountries } = useShipping()
  const { chargeCurrency } = useCurrency()
  const { addToCart } = useCart()
  const activeCountry = country || (!ready ? initialCountry : null)
  const [id, setId] = useState(initialId || variants[0]?.id)
  const [imageIndex, setImageIndex] = useState(0)
  const [status, setStatus] = useState('')
  const selected = variants.find(row => row.id === id) || variants[0]
  const price = selected && marketVariant(selected,activeCountry,chargeCurrency)
  if (!selected) return null
  const products = Array.from(new Map(variants.map(row => [row.productId,row])).values())
  const images = selected.gallery
  const image = images[imageIndex] || images[0]
  const countryNames = new Intl.DisplayNames([locale],{ type:'region' })
  const variantLabel = row => row.attributes.length
    ? row.attributes.map(attr => attr.value).join(' · ')
    : row.variantTitle || t('Configuración estándar','Standard configuration')
  function select(next) {
    setId(next)
    setImageIndex(0)
    setStatus('')
  }
  return <section className={styles.shell} aria-label={t('Presentaciones de arte mural','Wall art presentations')}>
    <div className={styles.gallery}>
      {image && <OptimizedImg key={image.url} src={image.url} alt={t(image.altEs,image.altEn)} priority sizes="(max-width: 700px) 100vw, 50vw" />}
      {images.length > 1 && <div className={styles.thumbnails}>{images.map((entry,index) =>
        <button type="button" key={entry.url} aria-pressed={image?.url === entry.url} onClick={() => setImageIndex(index)}>
          <OptimizedImg src={entry.url} alt={t(entry.altEs,entry.altEn)} sizes="80px" />
        </button>)}</div>}
    </div>
    <div className={styles.options}>
      <h2>{title}</h2>
      {!preview && selected.artworkSku && <Link href={'/artwork/' + encodeURIComponent(selected.artworkSku)}>
        {t('Ver obra original','View original artwork')}</Link>}
      <Select id="fine-art-presentation" labelText={t('Presentación','Presentation')} value={selected.productId}
        onChange={event => select(products.find(row => row.productId === event.target.value)?.id)}>
        {products.map(row => <SelectItem key={row.productId} value={row.productId} text={t(row.title,row.titleEn)} />)}
      </Select>
      <Select id="fine-art-configuration" labelText={t('Formato y acabado','Format and finish')} value={selected.id}
        onChange={event => select(event.target.value)}>
        {variants.filter(row => row.productId === selected.productId).map(row =>
          <SelectItem key={row.id} value={row.id} text={variantLabel(row)} />)}
      </Select>
      <Select id="fine-art-country" labelText={t('País de entrega','Delivery country')} value={activeCountry || ''}
        disabled={preview} onChange={event => { setCountry(event.target.value || null); setStatus('') }}>
        <SelectItem value="" text={t('Seleccionar','Select')} />
        {(globalCountries || []).map(code => <SelectItem key={code} value={code} text={countryNames.of(code)} />)}
      </Select>
      <p>{t(selected.description,selected.descriptionEn)}</p>
      {!!selected.attributes.length && <ul>{selected.attributes.map(item => <li key={item.code}>
        {specificationLabels[item.code] ? t(...specificationLabels[item.code]) + ' · ' : ''}{String(item.value)}
      </li>)}</ul>}
      <p aria-live="polite">{price ? catalogMoney(price.amountMinor,price.currency,locale)
        : activeCountry ? t('Sin precio disponible para este mercado','Unavailable in this market')
          : t('Selecciona tu destino para consultar el precio','Select your destination to see the price')}</p>
      {!preview && price && <ShippingBenefit
        item={{id:selected.id,type:fineArtLineType,allowed_shipping_countries:[activeCountry],
          artwork:{allowed_shipping_countries:selected.countries,shipping_policy_ids:selected.shippingPolicyIds}}}
        destination={activeCountry} artwork={{id:selected.artworkId,sku:selected.artworkSku,title}} />}
      <Button disabled={preview || !price || status === 'adding'} onClick={async () => {
        setStatus('adding')
        try {
          const added = await addToCart({ id:selected.artworkId, variantId:selected.id, quantity:1, type:fineArtLineType,
            destination:activeCountry, currency:price.currency })
          setStatus(added ? 'added' : 'failed')
        } catch { setStatus('failed') }
      }}>{t('Agregar al carrito','Add to cart')}</Button>
      {status === 'added' && <p role="status">{t('Agregado al carrito','Added to cart')}</p>}
      {status === 'failed' && <p role="alert">{t('No se pudo agregar esta presentación. Revisa el país y la moneda.','Could not add this presentation. Check the country and currency.')}</p>}
    </div>
  </section>
}

const specificationLabels = {
  size:['Tamaño','Size'], material:['Material','Material'], finish:['Acabado','Finish'], frame:['Marco','Frame'],
  orientation:['Orientación','Orientation'], width:['Ancho (mm)','Width (mm)'], height:['Alto (mm)','Height (mm)'],
  paper_weight:['Gramaje','Paper weight'], frame_color:['Color del marco','Frame color'], mat:['Paspartú','Mount'],
}
