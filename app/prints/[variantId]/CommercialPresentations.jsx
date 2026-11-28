'use client'

import PrintLoadError from '../PrintLoadError'
import { useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ShoppingCart } from '@carbon/icons-react'
import PrintShare from '@/components/share/PrintShare'
import editorial from '@/components/catalog/Editorial.module.css'
import { Button, Select, SelectItem } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { useMarket } from '@/components/market/MarketProvider'
import { useCurrency } from '@/components/CurrencyProvider'
import ShippingBenefit from '@/components/shipping/ShippingBenefit'
import { useShipping } from '@/components/shipping/ShippingProvider'
import { useCart } from '@/context/CartContext'
import WallSpaceLauncher from '@/components/prints/space/WallSpaceLauncher'
import RoomScene from '@/components/prints/RoomScene'
import {matchingRoomScenes,roomPrintPlacement,roomSceneScope} from '@/lib/productCatalog/roomScene'
import OptimizedImg from '@/components/media/OptimizedImg'
import { mockupAppearance } from '@/lib/productCatalog/configuration'
import WallArtMockup from '@/components/admin/productCatalog/WallArtMockup'
import { customerPrintChoices, customerPrintLabel, customerPrintOptions, printChoiceOrder, resolveCustomerPrint } from '@/lib/productCatalog/customerPrintConfiguration'
import { catalogMoney, fineArtLineType, marketVariant, printMarketOptions } from '@/lib/productCatalog/commerce'
import styles from './CommercialPresentations.module.css'

const labels = {
  paper:['Papel o material','Paper or material'],
  frame:['Marco','Frame'],
  size:['Tamaño','Size'],
  border:['Borde blanco','White margin'],
}

export default function CommercialPresentations({ variants, title, titleEn, initialId, country: initialCountry, historical, roomScenes, preview = false, partial = false }) {
  const { t, locale } = useI18n()
  const { country, setCountry, ready } = useMarket()
  const { globalCountries } = useShipping()
  const { chargeCurrency, currency, setCurrency } = useCurrency()
  const { addToCart } = useCart()
  const params = useSearchParams()
  const activeCountry = params.get('country')==='ALL' ? null : ready ? country : initialCountry ?? country
  const [selection,setSelection] = useState({requested:initialId,id:initialId})
  const id = selection.requested===initialId ? selection.id : initialId
  const [photo, setPhoto] = useState(null)
  const [status, setStatus] = useState(null)
  const [roomView,setRoomView]=useState(null)
  const [sceneChoice,setSceneChoice]=useState(null)
  const [failedPreview,setFailedPreview]=useState(null)
  const controlId = useId()
  const dialog = useRef(null)
  const { options:available, alternateCurrency } = printMarketOptions(variants,activeCountry,chargeCurrency,preview)
  const preferred = variants.find(row=>row.id===id)
  const selected = available.find(row=>row.id===id) || available[0]
  const shown = selected || preferred || variants[0]
  if (!shown) return null
  const price = selected && marketVariant(selected,activeCountry,chargeCurrency)
  const displayPrice = price || (selected && alternateCurrency && marketVariant(selected,activeCountry,alternateCurrency))
  const choices = customerPrintChoices(shown)
  const images = shown.gallery.flatMap((entry,index) => entry.illustration && shown.previewGeometry?.scenes?.includes('wall')
    ? [{...entry,key:index,scene:'gallery'},{...entry,key:'wall',scene:'wall'}]
    : [{...entry,key:index,scene:'gallery'}])
  const image = images.find(entry=>photo?.id===shown.id && entry.key===photo.key) || images[0]
  const countryNames = new Intl.DisplayNames([locale],{ type:'region' })
  const artworkTitle = t(title,titleEn || title)
  const selectionKey = JSON.stringify([shown.id,activeCountry,chargeCurrency])
  const feedback = status?.key===selectionKey ? status.state : null
  const priceText = displayPrice ? catalogMoney(displayPrice.amountMinor,displayPrice.currency,locale)
    : activeCountry ? partial
        ? t('No se pudo confirmar la disponibilidad para este destino','Availability could not be confirmed for this destination')
        : t('Sin precio disponible para este mercado','Unavailable in this market')
      : t('Selecciona tu destino para consultar el precio','Select your destination to see the price')
  const attributes = Object.fromEntries((shown.attributes || []).map(({code,value})=>[code,value]))
  const appearance = { ...shown.previewGeometry, frameWidthMm:shown.frameProfile?.widthMm || shown.previewGeometry?.frameWidthMm, attributes:{...attributes, frame_material:choices.frame_material, frame_color:choices.frame_color} }
  const dimensions = appearance.widthMm>0 && appearance.heightMm>0
    ? [appearance.widthMm,appearance.heightMm].map(mm=>new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(mm/10)).join(' × ') + ' cm'
    : null
  const illustration = image?.illustration && appearance.widthMm>0 && appearance.heightMm>0

  const source=roomScenes?.sources[shown.id]
  const print={...appearance,framed:choices.framing==='framed'}
  const sceneScope=roomSceneScope(shown)
  const scenes=source ? matchingRoomScenes(roomScenes.scenes,shown,sceneChoice?.scope===sceneScope ? sceneChoice.id : null) : []
  const scene=scenes[0]
  const room=scene && roomPrintPlacement(scene,print)
  const sceneKey=scene && JSON.stringify([scene.id,scene.revision])
  const roomKey=scene && JSON.stringify([sceneKey,source])
  const useRoom=roomView!==false && room?.fits && failedPreview!==roomKey
  const showRoom=()=> <RoomScene key={sceneKey} scene={scene} print={print} source={source} alt={artworkTitle}
    onImageError={()=>setFailedPreview(roomKey)} />

  function select(field,value) {
    const next = resolveCustomerPrint(available,shown,field,value)
    if (next) { setSelection({requested:initialId,id:next.id});setPhoto(null);setStatus(null) }
  }

  function changeCountry(next) {
    setCountry(next,{navigate:false})
    const url=new URL(window.location.href)
    url.searchParams.set('country',next || 'ALL')
    window.history.replaceState(null,'',url.pathname+url.search+url.hash)
    setStatus(null)
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

  const summary = printChoiceOrder.filter(field=>field!=='size' && choices[field])
    .map(field=>customerPrintLabel(field,choices[field],t)).join(' · ')

  const canCurate=!preview && appearance.widthMm>0 && appearance.heightMm>0
  const renderPreview=(open,roomPreview=false)=>image && <button type="button" className={styles.expand}
    aria-label={canCurate ? t('Abrir curaduría','Open Curate') : t('Ampliar vista del print','Enlarge print preview')} onClick={open}>
    {roomPreview ? showRoom() : illustration
      ? <WallArtMockup image={image.url} alt={artworkTitle} variant={appearance} fit={appearance.fit==='cover' ? 'cover' : 'contain'} scene={image.scene} borderMm={appearance.borderMm} framed={choices.framing==='framed'} />
      : <OptimizedImg key={image.url} src={image.url} alt={t(image.altEs,image.altEn)} priority sizes="(max-width: 700px) 100vw, 50vw" />}
  </button>

  return <section className={styles.shell} aria-label={t('Presentaciones de arte mural','Wall art presentations')}>
    <div className={styles.gallery}>
      {!canCurate && scene && <div className={styles.previewModes} role="group" aria-label={t('Vista del print','Print view')}>
        <Button kind="ghost" size="sm" aria-pressed={!useRoom} onClick={()=>setRoomView(false)}>{t('Vista del producto','Product view')}</Button>
        <Button kind="ghost" size="sm" aria-pressed={Boolean(useRoom)} disabled={!room?.fits || failedPreview===roomKey}
          onClick={()=>setRoomView(true)}>{t('Vista en ambiente','Room view')}</Button>
      </div>}
      {canCurate ? <WallSpaceLauncher curate renderPreview={renderPreview}
        initial={{variant:shown}} variants={variants} roomScenes={roomScenes} country={activeCountry} />
        : renderPreview(()=>dialog.current?.showModal(),useRoom)}
      {!canCurate && scene && scenes.length>1 && <Select id={`${controlId}-scene`} labelText={t('Ambiente','Room')} value={scene.id}
        onChange={event=>{setSceneChoice({scope:sceneScope,id:event.target.value});setRoomView(true)}}>
        {scenes.map(entry=><SelectItem key={entry.id} value={entry.id} text={entry.name} />)}
      </Select>}
      {!canCurate && scene && (!room?.fits || failedPreview===roomKey) && <p className={styles.caption} role="status">
        {room?.fits===false ? t('Este formato no cabe en el muro seleccionado.','This format does not fit the selected wall.')
          : t('La vista en ambiente no está disponible para esta configuración.','Room view is unavailable for this configuration.')}
      </p>}
      {!canCurate && useRoom && <p className={styles.caption}>
        {!room.calibrated ? t('Vista decorativa sin escala calibrada.','Decorative preview without calibrated scale.')
          : !room.outerVerified ? t('Escala calibrada del papel. El marco es ilustrativo.','Paper scale is calibrated. Frame is illustrative.')
          : t('Vista ilustrativa con escala del muro calibrada.','Illustrative view with calibrated wall scale.')}
      </p>}
      {(canCurate || !useRoom) && image?.illustration && <p className={styles.caption}>{t('Vista ilustrativa de la configuración','Illustrative configuration preview')}</p>}
      {images.length > 1 && <div className={styles.thumbnails}>{images.map((entry,index) =>
        <button type="button" key={entry.key} aria-pressed={image?.key===entry.key}
          aria-label={entry.illustration
            ? entry.scene==='wall' ? t('Vista en pared','Wall view') : t('Vista del print','Print view')
            : t(`Foto ${index+1}`,`Photo ${index+1}`)}
          onClick={()=>{setPhoto({id:shown.id,key:entry.key});setRoomView(false)}}>
          {entry.illustration && appearance.widthMm && appearance.heightMm
            ? <WallArtMockup image={entry.url} alt="" variant={appearance} fit={appearance.fit==='cover' ? 'cover' : 'contain'}
                scene={entry.scene} borderMm={appearance.borderMm} framed={choices.framing==='framed'} />
            : <OptimizedImg src={entry.url} alt="" sizes="80px" />}
        </button>)}</div>}
      {!canCurate && image && <dialog ref={dialog} className={styles.dialog} aria-label={t('Vista ampliada','Enlarged preview')}>
        <form method="dialog"><Button type="submit" kind="ghost" size="sm">{t('Cerrar','Close')}</Button></form>
        {useRoom ? showRoom() : illustration
          ? <WallArtMockup image={image.url} alt={artworkTitle} variant={appearance} fit={appearance.fit==='cover' ? 'cover' : 'contain'} scene={image.scene} borderMm={appearance.borderMm} framed={choices.framing==='framed'} />
          : <OptimizedImg src={image.url} alt={t(image.altEs,image.altEn)} sizes="85vw" />}
      </dialog>}
    </div>
    <div className={`${editorial.identity} ${styles.options}`}>
      <header className={styles.heading}>
        <h1 className={editorial.title}>{artworkTitle}</h1>
        <p className={editorial.meta}>{[historical && t('Versión anterior','Previous version'),t('Edición abierta','Open edition')].filter(Boolean).join(' · ')}</p>
      </header>
      <div className={styles.choices}>
        {selected && printChoiceOrder.map(field=>{
          const values=customerPrintOptions(available,selected,field)
          if (!values.length) return null
          const fieldLabel = t(...labels[field])
          if (values.length===1) return <div key={field} className={styles.fixedChoice}>
            <span>{fieldLabel}</span>
            <span>{customerPrintLabel(field,values[0].value,t)}</span>
          </div>
          return <fieldset key={field} className={styles.field}>
            <legend>{fieldLabel}</legend>
            <div className={styles.tiles}>{values.map(({value,compatible})=>{
              const label = customerPrintLabel(field,value,t)
              const color = field==='frame' && value!=='unframed' ? JSON.parse(value)[0] : null
              const swatch = color && mockupAppearance({widthMm:1,heightMm:1,attributes:{frame_color:color}},0,true)?.frameColor
              const adjustment = compatible ? null : t('Ajusta otras opciones','Adjusts other options')
              return <label key={value} className={`${styles.tile} ${compatible ? '' : styles.adjusts}`} title={adjustment || undefined}>
                <input type="radio" name={`${controlId}-${field}`} value={value} checked={choices[field]===value}
                  aria-label={adjustment ? `${label}. ${adjustment}` : undefined} onChange={()=>select(field,value)} />
                <span>{swatch && <i aria-hidden="true" style={{backgroundColor:swatch}} />}{label}</span>
              </label>
            })}</div>
          </fieldset>
        })}
      </div>
      <div className={styles.summary}>
        <p>{['Fine Art Print',choices.size,dimensions!==choices.size && dimensions].filter(Boolean).join(' · ')}</p>
        {summary && <p>{summary}</p>}
      </div>
      <Select id={`${controlId}-country`} labelText={t('País de entrega','Delivery country')} value={activeCountry || ''}
        disabled={preview} onChange={event=>changeCountry(event.target.value || null)}>
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
      {!preview && shown.artworkSku && <div className={styles.secondary}>
        <Link href={'/artwork/' + encodeURIComponent(shown.artworkSku)}>{t('Conocer la obra','Explore the artwork')}</Link>
        <PrintShare key={shown.id} variantId={shown.id} artworkSku={shown.artworkSku}
          presentation={{title:artworkTitle,description:summary,language:locale.startsWith('en') ? 'en' : 'es'}} />
      </div>}
      {partial && <PrintLoadError partial />}
      {alternateCurrency && currency===alternateCurrency && <p className={styles.caption} role="status">
        {t('La moneda de pago aún no está disponible.','The payment currency is not yet available.')}
      </p>}
      {alternateCurrency && currency!==alternateCurrency && <Button kind="tertiary" size="sm"
        onClick={()=>setCurrency(alternateCurrency)}>{t('Cambiar moneda a','Switch currency to')} {alternateCurrency}</Button>}
      <div className={styles.purchase} data-purchasable={!preview && Boolean(price)} data-mobile-purchase-actions={!preview}>
        <p className={displayPrice ? editorial.price : styles.caption} aria-live="polite">{priceText}</p>
        <Button className={editorial.purchaseButton} renderIcon={ShoppingCart}
          disabled={preview || !price || feedback==='adding'} onClick={add}>
          {feedback==='adding' ? t('Agregando…','Adding…') : t('Agregar al carrito','Add to Cart')}
        </Button>
      </div>
    </div>
  </section>
}
