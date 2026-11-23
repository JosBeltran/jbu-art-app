'use client'
import { useEffect, useRef, useState } from 'react'
import { Button, Select, SelectItem, TextArea, TextInput } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { studioValue } from '@/lib/productCatalog/studioDiscovery'
import { proposedWallArtPrice, wallArtFamilies, wallArtMoney } from '@/lib/productCatalog/wallArt'
import shared from './ProductCatalog.module.css'
import styles from './WallArtStudio.module.css'
const suppliers = {gelato:'Gelato',prodigi:'Prodigi'}
const shippingMessages = {
  shipping_address_invalid:['Revisa la dirección y los datos del destinatario.','Check the address and recipient details.'],
  shipping_product_invalid:['Gelato no reconoce el identificador de esta variante.','Gelato does not recognize this variant identifier.'],
  shipping_destination_unsupported:['La variante no está disponible en este destino.','The variant is unavailable in this destination.'],
  shipping_methods_unavailable:['Gelato no devolvió un método de envío para este destino.','Gelato returned no shipping method for this destination.'],
  shipping_provider_rejected:['Gelato rechazó la cotización.','Gelato rejected the quote.'],
  shipping_provider_transient:['Gelato no respondió o limitó la consulta. Reintenta.','Gelato did not respond or rate-limited the request. Retry.'],
  shipping_response_invalid:['Gelato no devolvió una cotización válida.','Gelato did not return a valid quote.'],
  provider_not_configured:['La integración de Gelato no está configurada.','The Gelato integration is not configured.'],
  quote_requires_manual_review:['La cotización requiere revisión en Gelato.','The quote requires review in Gelato.'],
}
const amountMinor = (value,currency) => Math.round(Number(value)*10**wallArtMoney(currency))

export function studioProductContent(artwork, editorial, series, rows) {
    const item = rows[0]
    const category = item.titles || wallArtFamilies[item.group]
    const attributes = item.variant.attributes || {}
    const material = [attributes.paper, attributes.material, attributes.frame_material, attributes.PaperType, attributes.Material, attributes.CanvasType].find(value => typeof value === 'string')
    const dimensions = rows.map(row => row.variant.widthMm && row.variant.heightMm
      ? `${row.variant.widthMm} × ${row.variant.heightMm} mm` : null).filter(Boolean).join(', ')
    return editorial[series] || {
      titleEs: (artwork.title + ' · ' + category[0]).slice(0,240),
      titleEn: ((artwork.title_en || artwork.title) + ' · ' + category[1]).slice(0,240),
      descriptionEs: ('Reproducción bajo pedido de «' + artwork.title + '».' +
        (material ? ' Material: ' + material.replaceAll('-', ' ') + '.' : '') +
        (dimensions ? ' Formatos: ' + dimensions + '.' : '')).slice(0,4000),
      descriptionEn: ('Made-to-order reproduction of “' + (artwork.title_en || artwork.title) + '”.' +
        (material ? ' Material: ' + material.replaceAll('-', ' ') + '.' : '') +
        (dimensions ? ' Sizes: ' + dimensions + '.' : '')).slice(0,4000),
    }
  }


export default function StudioEditorial({ artwork, groups, selected, books, bookId, onBookChange, costs, busy,
  onLoadCosts, onAddressChange, initialDraft, onDraftChange, onValidityChange }) {
  const {t,lang} = useI18n()
  const [draft,setDraft] = useState(initialDraft)
  const latest = useRef(initialDraft)
  const [clock,setClock] = useState(()=>Date.now())
  useEffect(()=>{
    const timer=setInterval(()=>setClock(Date.now()),15000)
    return ()=>clearInterval(timer)
  },[])
  const {editorial,prices,margin} = draft
  const titleFor = item => item.titles ? item.titles[lang==='en'?1:0] : item.name || t(...wallArtFamilies[item.group])
  const hasGelato = selected.some(item=>item.provider==='gelato')
  const activeBook = books.find(book=>book.id===bookId)
  const displayNames = new Intl.DisplayNames([lang || 'es'],{type:'region'})
  const currencyLabel = (minor,currency) => new Intl.NumberFormat(lang,{style:'currency',currency}).format(Number(minor)/10**wallArtMoney(currency))
  const productContent = (series,rows) => studioProductContent(artwork,editorial,series,rows)
  function write(update) {
    const next = update(latest.current)
    latest.current = next
    setDraft(next)
    onDraftChange(next)
  }
  const invalidPrices = books.some(book=>selected.some(row=>{
    const value=prices[book.id]?.[row.rowKey],minor=amountMinor(value,book.currency)
    return value!=null && value!=='' && (!Number.isSafeInteger(minor)||minor<1||minor>999999999999)
  }))
  const invalidTitles = groups.some(([series,rows])=>!productContent(series,rows).titleEs.trim())
  useEffect(()=>onValidityChange(!invalidTitles && !invalidPrices),[invalidTitles,invalidPrices,onValidityChange])
  const marketCosts = costs[bookId]
  const costFor = row => marketCosts?.[row.rowKey]
  const validShipping = cost => cost?.shippingMinor != null && Date.parse(cost.shippingExpiry)>clock
  const totalCost = cost => validShipping(cost) && cost.shippingCurrency===activeBook?.currency && cost.manufacturingMinor!=null
    ? cost.manufacturingMinor+cost.shippingMinor : null
  function applyMargin() {
    write(previous=>{
      const market={...previous.prices[bookId]}
      for(const row of selected){
        const proposed=proposedWallArtPrice(totalCost(costFor(row)),Number(previous.margin))
        if(proposed!=null)market[row.rowKey]=String(proposed/10**wallArtMoney(activeBook.currency))
      }
      return {...previous,prices:{...previous.prices,[bookId]:market}}
    })
  }
  return <>
    <section className={shared.section}>
      <h2>{t('Edita títulos y descripciones','Edit titles and descriptions')}</h2>
      {groups.map(([series,rows]) => {
        const content = productContent(series,rows)
        const update = (key, value) => write(previous => ({ ...previous, editorial: {...previous.editorial, [series]: { ...studioProductContent(artwork,previous.editorial,series,rows), [key]: value }} }))
        return <article className={shared.item} key={series}>
          <p>{titleFor(rows[0])} · {suppliers[rows[0].provider]} · {rows.length} {t('variantes','variants')}</p>
          <FieldPair label={t('Título','Title')} series={series} content={content} update={update} field="title" input={TextInput} />
          <FieldPair label={t('Descripción','Description')} series={series} content={content} update={update} field="description" input={TextArea} />
        </article>
      })}
    </section>

    <section className={shared.section}>
      <h2>{t('Precios por mercado','Market prices')}</h2>
      <p>{t('Gelato cotiza por país. Aplicar margen suma fabricación y envío en la moneda del mercado. Usa una dirección para confirmar el envío o cotizar con otro proveedor.','Gelato returns rates by country. Apply margin uses manufacturing and shipping in the market currency. Provide an address to confirm shipping or quote with another supplier.')}</p>
      <div className={styles.controls}>
        <Select id="wall-price-book" labelText={t('País de entrega y moneda','Destination country and currency')} value={bookId} onChange={event => onBookChange(event.target.value)}>
          {!books.length && <SelectItem value="" text={t('Sin listas de precios','No price books')} />}
          <SelectItem value="" text={t('Seleccionar mercado','Select market')} />
          {books.map(book => <SelectItem key={book.id} value={book.id} text={`${displayNames.of(book.country)} · ${book.currency} · ${book.name}`} />)}
        </Select>
        <Button type="button" disabled={busy || !activeBook} onClick={()=>onLoadCosts()}>{t('Consultar costos por país','Get costs by country')}</Button>
        <TextInput id="wall-margin" labelText={t('Margen objetivo (%)','Target margin (%)')} min="0" max="99" type="number" value={margin}
          onChange={event => write(previous=>({...previous,margin:event.target.value}))} />
        <Button type="button" kind="tertiary" disabled={busy || !selected.some(row=>totalCost(costFor(row))!=null) || margin === '' || Number(margin) < 0 || Number(margin) >= 100}
          onClick={applyMargin}>{t('Aplicar margen','Apply margin')}</Button>
      </div>
      {activeBook && <details key={activeBook.country}>
        <summary>{t('Cotizar con dirección','Quote with an address')}</summary>
        <form key={activeBook.country} className={shared.fields} onChange={onAddressChange} onSubmit={event=>{
        event.preventDefault()
        const address = Object.fromEntries(new FormData(event.currentTarget))
        onLoadCosts({...address,region:address.region.trim() || undefined})
      }}>
        {hasGelato && <div className={styles.controls}>
          <TextInput id="quote-first-name" name="firstName" labelText={t('Nombre del destinatario','Recipient first name')} maxLength={25} required />
          <TextInput id="quote-last-name" name="lastName" labelText={t('Apellido del destinatario','Recipient last name')} maxLength={25} required />
          <TextInput id="quote-email" name="email" labelText={t('Correo del destinatario','Recipient email')} type="email" maxLength={254} required />
        </div>}
        <div className={styles.controls}>
          <TextInput id="quote-line1" name="line1" labelText={t('Calle y número','Street address')} maxLength={100} required />
          {hasGelato && <TextInput id="quote-line2" name="line2" labelText={t('Complemento de dirección (opcional)','Address line 2 (optional)')} maxLength={100} />}
          <TextInput id="quote-city" name="city" labelText={t('Ciudad','City')} maxLength={50} required />
          <TextInput id="quote-postal" name="postalCode" labelText={t('Código postal','Postal code')} maxLength={20} required />
          <TextInput id="quote-region" name="region" labelText={t('Estado o región','State or region')} maxLength={50}
            required={hasGelato && ['AU','CA','US'].includes(activeBook.country)} />
        </div>
        <Button type="submit" disabled={busy}>{t('Cotizar envío','Quote shipping')} · {displayNames.of(activeBook.country)}</Button>
      </form></details>}
      {activeBook && <div className={styles.table}><table>
        <thead><tr><th>{t('Variante','Variant')}</th><th>{t('Fabricación','Manufacturing')}</th><th>{t('Envío','Shipping')}</th>
          <th>{t('Precio de venta','Retail price')}</th><th>{t('Margen con envío','Margin including shipping')}</th></tr></thead>
        <tbody>{selected.map(item => {
          const cost = costFor(item)
          const total = totalCost(cost)
          const value = prices[bookId]?.[item.rowKey] ?? ''
          const retail = amountMinor(value, activeBook.currency)
          const profit = retail > 0 && total != null ? Math.round(100 * (retail - total) / retail) : null
          return <tr key={item.rowKey}>
            <td>{titleFor(item)} · {Object.values(item.variant.attributes).map(value=>t(...studioValue(value))).join(' · ')}</td>
            <td>{cost?.manufacturingMinor != null ? currencyLabel(cost.manufacturingMinor,activeBook.currency)
              : cost ? t('Sin costo verificable','Cost unavailable') : '—'}</td>
            <td>{validShipping(cost)
              ? <>{currencyLabel(cost.shippingMinor,cost.shippingCurrency)}<br />{
                cost.shippingKind==='flat' ? t('Tarifa fija','Flat rate') :
                cost.shippingKind==='average' ? t('Promedio estimado','Estimated average') : t('Por dirección','Address quote')
              }{cost.shippingCurrency!==activeBook.currency && <><br />{t('Moneda distinta a la lista','Different price book currency')}</>}</>
              : cost?.shippingErrorCode ? <>{t(...(shippingMessages[cost.shippingErrorCode] || shippingMessages.shipping_response_invalid))}{cost.shippingProviderStatus ? ' · HTTP '+cost.shippingProviderStatus : ''}</>
                : cost?.shippingMinor != null ? t('Cotización vencida','Quote expired')
                  : item.provider==='gelato' ? '—' : t('Cotiza con una dirección','Quote with an address')}
              {cost?.addressQuoteError && <><br />{t('No se pudo cotizar la dirección','Address quote unavailable')}</>}
            </td>
            <td><TextInput id={'wall-price-' + encodeURIComponent(item.rowKey)} labelText={t('Precio de venta','Retail price') + ' · ' + titleFor(item)}
              hideLabel type="number" min={1 / 10 ** wallArtMoney(activeBook.currency)} step={1 / 10 ** wallArtMoney(activeBook.currency)}
              value={value} onChange={event => {
                const amount = event.target.value
                write(previous => ({...previous,prices:{...previous.prices,[bookId]:{...previous.prices[bookId],[item.rowKey]:amount}}}))
              }} /></td>
            <td>{profit == null ? '—' : profit + '%'}</td>
          </tr>
        })}</tbody>
      </table></div>}
    </section>

  </>
}

function FieldPair({ field, series, label, content, update, input: Input }) {
  return <div className={shared.cols}>{['Es','En'].map(language => {
    const key = field + language
    return <Input key={key} id={key + '-' + series} labelText={label + ' · ' + language.toUpperCase()} value={content[key]}
      maxLength={field === 'title' ? 240 : 4000} onChange={event => update(key,event.target.value)} />
  })}</div>
}
