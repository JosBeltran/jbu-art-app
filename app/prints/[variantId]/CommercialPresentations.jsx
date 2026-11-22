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
import WallArtMockup from '@/components/admin/productCatalog/WallArtMockup'
import OptimizedImg from '@/components/media/OptimizedImg'
import {approvedConfigurations,attributeOptions,matchesAttributes} from '@/lib/productCatalog/configuration'
import { catalogMoney, fineArtLineType, marketVariant,marketChoices } from '@/lib/productCatalog/commerce'
import styles from './CommercialPresentations.module.css'

export default function CommercialPresentations({ variants, title, initialId, country: initialCountry, preview = false }) {
  const { t, locale } = useI18n()
  const { country, setCountry, ready } = useMarket()
  const { globalCountries } = useShipping()
  const { chargeCurrency } = useCurrency()
  const { addToCart } = useCart()
  const activeCountry = country || (!ready ? initialCountry : null)
  const initialVariant = variants.find(row=>row.id===initialId)
  const [id, setId] = useState(initialVariant?.id || (variants[0]?.mockup ? '' : variants[0]?.id) || '')
  const [productId, setProductId] = useState(initialVariant?.productId || variants[0]?.productId)
  const [imageIndex, setImageIndex] = useState(null)
  const [scene,setScene] = useState(null)
  const [status, setStatus] = useState('')
  const [choices,setChoices]=useState({})
  const selected = variants.find(row => row.id === id) || variants.find(row=>row.productId===productId) || variants[0]
  const price = selected && marketVariant(selected,activeCountry,chargeCurrency)
  if (!selected) return null
  const available=marketChoices(variants,activeCountry,chargeCurrency,preview)
  const products = Array.from(new Map(available.map(row => [row.productId,row])).values())
  const approved=approvedConfigurations(available,selected.productId)
  const keys=[...new Set(approved.flatMap(row=>Object.keys(row.attributes)))]
  const hasVariant = Boolean(id && selected.id===id)
  const mockup = hasVariant && imageIndex===null && selected.mockup
  const images = hasVariant ? selected.gallery : []
  const image = images[imageIndex] || images[0]
  const referenceMm = Math.max(0,...variants.filter(row=>row.productId===selected.productId && row.mockup)
    .flatMap(row=>[row.mockup.widthMm,row.mockup.heightMm]))
  const countryNames = new Intl.DisplayNames([locale],{ type:'region' })
  const variantLabel = row => row.attributes.length
    ? row.attributes.map(attr => attr.value).join(' · ')
    : row.variantTitle || t('Configuración estándar','Standard configuration')
  function select(next) {
    setId(next)
    setImageIndex(null)
    setScene(null)
    setStatus('');setChoices({})
  }
  return <section className={styles.shell} aria-label={t('Presentaciones de arte mural','Wall art presentations')}>
    <div className={styles.gallery}>
      {mockup ? <>
        <WallArtMockup image={mockup.image} alt={title} fit={mockup.fit} scene={scene || mockup.scene}
          borderMm={mockup.borderMm} referenceMm={referenceMm}
          variant={{...mockup,attributes:Object.fromEntries(selected.attributes.map(row=>[row.code,row.value]))}}
          framed={['framed_print','framed_canvas'].includes(selected.productFamily)} />
        <p>{t('Vista ilustrativa','Illustrative preview')} · {mockup.widthMm} × {mockup.heightMm} mm</p>
        {mockup.scenes.length > 1 && <div className={styles.thumbnails}>
          {mockup.scenes.map(option=><Button key={option} kind="ghost" size="sm"
            aria-pressed={(scene || mockup.scene)===option} onClick={()=>setScene(option)}>
            {option==='wall' ? t('Pared','Wall') : t('Galería','Gallery')}
          </Button>)}
        </div>}
      </> : !hasVariant && selected.cover ? <OptimizedImg src={selected.cover} alt={title} priority sizes="(max-width: 700px) 100vw, 50vw" />
      : image && <OptimizedImg key={image.url} src={image.url} alt={t(image.altEs,image.altEn)} priority sizes="(max-width: 700px) 100vw, 50vw" />}
      {hasVariant && (selected.mockup ? images.some(entry=>entry.url!==selected.mockup.image) : images.length>1) &&
        <div className={styles.thumbnails}>
          {selected.mockup && <Button kind="ghost" size="sm" aria-pressed={Boolean(mockup)}
            onClick={()=>setImageIndex(null)}>{t('Ver mockup','View mockup')}</Button>}
          {images.map((entry,index) =>
        <button type="button" key={entry.url} aria-pressed={!mockup && image?.url === entry.url} onClick={() => setImageIndex(index)}>
          <OptimizedImg src={entry.url} alt={t(entry.altEs,entry.altEn)} sizes="80px" />
        </button>)}</div>}
    </div>
    <div className={styles.options}>
      <h2>{title}</h2>
      {!preview && selected.artworkSku && <Link href={'/artwork/' + encodeURIComponent(selected.artworkSku)}>
        {t('Ver obra original','View original artwork')}</Link>}
      <Select id="fine-art-presentation" labelText={t('Presentación','Presentation')} value={selected.productId}
        onChange={event => {
          const product = products.find(row=>row.productId===event.target.value)
          setProductId(product?.productId)
          select(product?.mockup ? '' : product?.id || '')
        }}>
        {!products.some(row=>row.productId===selected.productId) && <SelectItem value={selected.productId} text={t('Presentación no disponible en este destino','Presentation unavailable for this destination')} disabled />}
        {products.map(row => <SelectItem key={row.productId} value={row.productId} text={t(row.title,row.titleEn)} />)}
      </Select>
      {keys.map((key,index)=>{
        const preceding=Object.fromEntries(keys.slice(0,index).filter(name=>choices[name]).map(name=>[name,choices[name]]))
        const values=attributeOptions(approved,preceding)[key] || []
        return <Select key={key} id={'fine-art-attribute-'+key} labelText={specificationLabels[key] ? t(...specificationLabels[key]) : key}
          value={choices[key] || ''} onChange={event=>{
            const next={...preceding,...(event.target.value ? {[key]:event.target.value} : {})}
            const match=approved.find(row=>matchesAttributes(row.attributes,next))
            if(match){setId(match.id);setImageIndex(null);setScene(null);setStatus('');setChoices(next)}
          }}>
          <SelectItem value="" text={t('Seleccionar','Select')} />
          {values.map(value=><SelectItem key={value} value={value} text={value} />)}
        </Select>
      })}
      <Select id="fine-art-configuration" labelText={t('Formato y acabado','Format and finish')} value={hasVariant ? selected.id : ''}
        onChange={event => select(event.target.value)}>
        <SelectItem value="" text={t('Selecciona una variante','Select a variant')} />
        {hasVariant && !available.some(row=>row.id===selected.id) && <SelectItem value={selected.id} text={t('Configuración no disponible en este destino','Configuration unavailable for this destination')} disabled />}
        {available.filter(row => row.productId === selected.productId).map(row =>
          <SelectItem key={row.id} value={row.id} text={variantLabel(row)} />)}
      </Select>
      <Select id="fine-art-country" labelText={t('País de entrega','Delivery country')} value={activeCountry || ''}
        disabled={preview} onChange={event => { setCountry(event.target.value || null); setStatus('') }}>
        <SelectItem value="" text={t('Seleccionar','Select')} />
        {(globalCountries || []).map(code => <SelectItem key={code} value={code} text={countryNames.of(code)} />)}
      </Select>
      <p>{t(selected.description,selected.descriptionEn)}</p>
      {hasVariant && !!selected.attributes.length && <ul>{selected.attributes.map(item => <li key={item.code}>
        {specificationLabels[item.code] ? t(...specificationLabels[item.code]) + ' · ' : ''}{String(item.value)}
      </li>)}</ul>}
      <p aria-live="polite">{!hasVariant ? t('Selecciona una variante para consultar el precio','Select a variant to see the price') : price ? catalogMoney(price.amountMinor,price.currency,locale)
        : activeCountry ? t('Sin precio disponible para este mercado','Unavailable in this market')
          : t('Selecciona tu destino para consultar el precio','Select your destination to see the price')}</p>
      {!preview && hasVariant && price && <ShippingBenefit
        item={{id:selected.id,type:fineArtLineType,allowed_shipping_countries:[activeCountry],
          artwork:{allowed_shipping_countries:selected.countries,shipping_policy_ids:selected.shippingPolicyIds}}}
        destination={activeCountry} artwork={{id:selected.artworkId,sku:selected.artworkSku,title}} />}
      <Button disabled={preview || !hasVariant || !price || status === 'adding'} onClick={async () => {
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
