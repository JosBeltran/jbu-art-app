'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Breadcrumb, BreadcrumbItem, Button, Select, SelectItem } from '@carbon/react'
import { ShoppingCart } from '@carbon/icons-react'
import { marketVariant } from '@/lib/productCatalog/commerce'
import { useI18n } from '@/components/I18nProvider'
import { useMarket } from '@/components/market/MarketProvider'
import { useCurrency, ExchangeNote } from '@/components/CurrencyProvider'
import { useCart } from '@/context/CartContext'
import { DiscussionPanel } from '@/components/comments/ArtworkDiscussionModal'
import { clearDiscussionDestination } from '@/lib/artworkDiscussion'
import PrintGallery from '@/components/media/PrintGallery'
import PrintShare from '@/components/share/PrintShare'
import ShippingBenefit from '@/components/shipping/ShippingBenefit'
import { browsingCountry } from '@/lib/market'
import { itemAvailableInCountry } from '@/lib/countryAvailability'
import { isPurchasablePrintVariant } from '@/lib/catalogPrintAvailability'
import { printGalleryImages } from '@/lib/printGallery'
import { printSharePresentation } from '@/lib/social/print'
import { artworkPrintHref } from '@/lib/printRoutes'
import { ARTWORK_PLACEHOLDER } from '@/lib/artworkPlaceholder'
import styles from '@/components/catalog/Editorial.module.css'

export default function PrintDetail({ artwork, initialVariant, country, siteSettings, guestPrintCheckout, legacy, commentsEnabled, commercial = [] }) {
  const { t, lang } = useI18n()
  const market = useMarket()
  const { price: displayPrice, chargeCurrency } = useCurrency()
  const { cart, addToCart, user } = useCart()
  const params = useSearchParams()
  const [pending, setPending] = useState(false)
  const [failedVariant, setFailedVariant] = useState(null)
  const destination = browsingCountry(params.get('country'), market.country || country)
  const replacements = new Set(commercial.filter(row=>marketVariant(row,destination,chargeCurrency)).map(row=>row.replacesPrintId))
  const variants = artwork.artwork_prints.filter(row=>!replacements.has(row.id) || row.id === initialVariant)
  const eligible = artwork.allows_prints ? variants.filter(variant =>
    isPurchasablePrintVariant(variant) && itemAvailableInCountry(variant, destination)) : []
  const requested = params.get('variant')?.toLowerCase() || initialVariant
  const legacySelection = legacy && !params.has('variant') ? variants.find(variant => variant.id === initialVariant) : null
  const linkedVariant = commentsEnabled && variants.find(variant => variant.is_active && variant.id === requested &&
    params.get('discussion') === 'print:' + variant.id)
  const selected = linkedVariant || eligible.find(variant => variant.id === requested) || legacySelection || eligible[0] || null
  const legacyProduct = !variants.length && !destination && artwork.allows_prints && !artwork.has_managed_prints && Number(artwork.print_price_mxn) > 0
  const limited = ['LIMITED', 'LIMITADA'].includes(String(selected?.edition_type || artwork.print_type).toUpperCase())
  const editionSize = Number(selected?.max_edition_size || selected?.edition_size || selected?.print_limit || artwork.print_edition_size || 0)
  const sold = Number(selected ? selected.prints_sold : artwork.prints_sold) || 0
  const canBuy = selected ? eligible.includes(selected) : legacyProduct && (!limited || sold < editionSize)
  const title = t(artwork.title, artwork.title_en || artwork.title)
  const linkedPrint = selected && params.get('discussion') === 'print:' + selected.id
  const label = selected && t(selected.title, selected.title_en || selected.title)
  const description = selected && t(selected.description, selected.description_en || selected.description)
  const unitPrice = Number(selected?.price ?? artwork.print_price_mxn ?? 0)
  const pricing = displayPrice(unitPrice)
  const variantKey = selected?.id || 'legacy'
  const previousImage = selected?.resolved_print_image_url || artwork.print_media?.firstFlagged || artwork.primary_image_url
  const images = printGalleryImages(selected?.gallery_images, previousImage || ARTWORK_PLACEHOLDER, lang)
  const presentation = selected ? printSharePresentation(artwork, selected, lang) : null
  const original = '/artwork/' + encodeURIComponent(artwork.sku)
  const originalHref = original + (params.has('country') ? '?' + new URLSearchParams({ country: params.get('country') }) : '')
  const inCart = cart?.some(item => item.type === 'PRINT' && item.id === artwork.id &&
    (selected ? item.variantId === selected.id : !item.variantId))
  const finishes = {
    FINE_ART: 'Fine Art', CANVAS: t('Lienzo', 'Canvas'), GLOSS: t('Brillante', 'Gloss'),
    MATTE: t('Mate', 'Matte'), RESIN: t('Resina', 'Resin'),
  }
  const finishLabel = value => finishes[value] || value
  const specRows = [
    [t('Dimensiones', 'Dimensions'), presentation?.dimensionsLabel || selected?.size],
    [t('Papel', 'Paper'), selected?.paper_type],
    [t('Acabado', 'Finish'), finishLabel(selected?.finish)],
    [t('Marco', 'Framing'), selected?.framing],
  ].filter(([, value]) => value)

  useEffect(() => {
    const id = params.get('variant')
    if (!id || !selected || id === selected.id) return
    const next = new URL(window.location.href)
    next.searchParams.set('variant', selected.id)
    window.history.replaceState(null, '', next.pathname + next.search + next.hash)
  }, [params, selected])

  function changeVariant(id) {
    const next = new URL(window.location.href)
    next.pathname = artworkPrintHref(artwork.sku)
    next.searchParams.set('variant', id)
    window.history.pushState(null, '', next.pathname + next.search + next.hash)
  }

  async function buy() {
    if (!canBuy || pending || inCart) return
    setPending(true)
    setFailedVariant(null)
    try {
      const added = await addToCart({
        id: artwork.id, type: 'PRINT', variantId: selected?.id,
        title: label || title, price: unitPrice, size: selected?.size,
        finish: selected?.finish, image: previousImage,
      })
      if (!added) setFailedVariant(variantKey)
    } catch {
      setFailedVariant(variantKey)
    } finally {
      setPending(false)
    }
  }

  return <main className={styles.detail}>
    <Breadcrumb noTrailingSlash>
      <BreadcrumbItem href="/">{t('Galería', 'Gallery')}</BreadcrumbItem>
      <BreadcrumbItem href={'/prints' + (params.has('country') ? '?' + new URLSearchParams({ country: params.get('country') }) : '')}>Fine Art Prints</BreadcrumbItem>
      <BreadcrumbItem isCurrentPage>{title}</BreadcrumbItem>
    </Breadcrumb>
    <section id="prints" className={styles.intro}>
      <PrintGallery variantId={variantKey} title={label || title} images={images}
        initialDiscussion={commentsEnabled && linkedPrint ? params.get('photo') || '' : null}
        onDiscussionDismiss={clearDiscussionDestination}
        renderDiscussion={commentsEnabled && selected ? image => <DiscussionPanel
          artworkId={artwork.id} user={user} context={{ kind: 'print', ref: selected.id }}
          title={title} label={[label, selected.size, images.length > 1 &&
            t(`Foto ${images.indexOf(image) + 1}`, `Photo ${images.indexOf(image) + 1}`)].filter(Boolean).join(' · ')} photo={image.url} /> : undefined}>
      <div className={styles.identity}>
        <p className={styles.meta}>Fine Art Print{(selected || legacyProduct) && ' · ' + (limited ? t('Edición limitada', 'Limited Edition') : t('Edición abierta', 'Open Edition'))}</p>
        <h1 className={styles.title}>{title}</h1>
        {(eligible.length > 1 || (legacySelection && eligible.length > 0 && !eligible.includes(legacySelection))) && <Select id="print-variant-select" labelText={t('Formato y acabado', 'Format and finish')}
          value={selected?.id || ''} onChange={event => changeVariant(event.target.value)}>
          {legacySelection && !eligible.includes(legacySelection) && <SelectItem value={legacySelection.id}
            disabled text={t('Variante no disponible', 'Unavailable variant')} />}
          {eligible.map(variant => <SelectItem key={variant.id} value={variant.id} text={
            [t(variant.title, variant.title_en || variant.title), variant.size, finishLabel(variant.finish), variant.framing].filter(Boolean).join(' · ')
          } />)}
        </Select>}
        {(selected || legacyProduct) && <>
          {label && label !== title && <p>{label}</p>}
          {selected && <p className={styles.summary}>{[presentation?.dimensionsLabel || selected.size, selected.framing, finishLabel(selected.finish)].filter(Boolean).join(' · ')}</p>}
          {limited && editionSize > 0 && <p className={styles.summary}>{t(`Edición de ${editionSize} · ${Math.max(0, editionSize - sold)} disponibles`, `Edition of ${editionSize} · ${Math.max(0, editionSize - sold)} available`)}</p>}
        </>}
        {canBuy ? <>
          <p className={styles.price}>{pricing.text}</p>
          {pricing.approximate && <ExchangeNote />}
          <Button kind="primary" renderIcon={ShoppingCart} disabled={pending || inCart} onClick={buy}>
            {pending ? t('Agregando…', 'Adding…') : inCart ? t('En el carrito', 'In cart') : t('Agregar print al carrito', 'Add print to cart')}
          </Button>
          {failedVariant === variantKey && <p role="alert">{t('No pudimos agregar este print. Comprueba que sigue disponible.', 'We could not add this print. Check that it is still available.')}</p>}
        </> : <p role="status">{selected && limited && sold >= editionSize
          ? t('Edición agotada', 'Sold out edition')
          : t('No hay prints disponibles para este destino.', 'No prints are available for this destination.')}</p>}
        {selected && canBuy && <ShippingBenefit item={{ ...selected, type: 'PRINT', artwork }} destination={destination} artwork={artwork} settings={siteSettings} />}
        {presentation && <PrintShare key={variantKey} variantId={selected.id} artworkSku={artwork.sku} presentation={presentation} />}
      </div>
      </PrintGallery>
    </section>
    <div className={styles.afterIntro}>
      {(selected || legacyProduct) && <section className={styles.editorialSection}>
        <h2>{t('Sobre esta edición', 'About this edition')}</h2>
        {!limited && <p>{t('Las reproducciones de edición abierta no incluyen el certificado de autenticidad de la obra original.', 'Open Edition reproductions do not include the original artwork’s authenticity certificate.')}</p>}
        {!limited && selected && guestPrintCheckout && canBuy && <p>{t('Compra sin registro disponible.', 'Guest checkout available.')}</p>}
        {(specRows.length > 0 || description) ? <details className={styles.disclosure}>
          <summary>{t('Ver características completas', 'View full specifications')}</summary>
          {specRows.length > 0 && <dl>{specRows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>}
          {description && <p className={styles.description}>{description}</p>}
        </details> : <p>{t('No hay especificaciones adicionales para esta edición.', 'No additional specifications are available for this edition.')}</p>}
      </section>}
      <section className={styles.editorialSection}>
        <h2>{t('La obra original', 'The original artwork')}</h2>
        <p>{t('Consulta la historia, la ficha técnica y la procedencia en la página de la obra original.', 'Find the work’s history, technical record and provenance on the original artwork page.')}</p>
        <Link href={originalHref}>{t('Conocer la obra original', 'Explore the Original Artwork')}</Link>

      </section>
    </div>
  </main>
}
