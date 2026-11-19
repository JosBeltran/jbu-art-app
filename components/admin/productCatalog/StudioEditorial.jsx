'use client'
import { useEffect, useRef, useState } from 'react'
import { Button, Select, SelectItem, TextArea, TextInput } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { studioCapabilities, studioValue } from '@/lib/productCatalog/studioDiscovery'
import { proposedWallArtPrice, wallArtFamilies, wallArtMoney } from '@/lib/productCatalog/wallArt'
import shared from './ProductCatalog.module.css'
import styles from './WallArtStudio.module.css'
const suppliers = {gelato:'Gelato',prodigi:'Prodigi'}
const amountMinor = (value,currency) => Math.round(Number(value)*10**wallArtMoney(currency))

export function studioProductContent(artwork, editorial, series, rows) {
    const item = rows[0]
    const category = wallArtFamilies[item.group]
    const attributes = item.variant.attributes || {}
    const material = [attributes.PaperType, attributes.Material, attributes.CanvasType].find(value => typeof value === 'string')
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
  onLoadCosts, initialDraft, onDraftChange, onValidityChange }) {
  const {t,lang} = useI18n()
  const [draft,setDraft] = useState(initialDraft)
  const latest = useRef(initialDraft)
  const {editorial,prices,margin} = draft
  const titleFor = item => item.name || t(...wallArtFamilies[item.group])
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
  function applyMargin() {
    write(previous=>{
      const market={...previous.prices[bookId]}
      for(const row of selected){
        const proposed=proposedWallArtPrice(costs[bookId]?.[row.id]?.manufacturingMinor,Number(previous.margin))
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
      {selected.some(item=>!studioCapabilities[item.provider].destinationPricing) && <p>{t(
        'Prodigi requiere una cotización con dirección para confirmar el costo de entrega. Puedes registrar el precio manualmente.',
        'Prodigi needs an address-based quote to confirm delivery costs. You can enter a retail price manually.')}</p>}
      <p>{t('El margen se calcula sobre fabricación. Envío e impuestos quedan por confirmar. Puedes guardar sin precio.','Margin uses manufacturing cost. Shipping and tax are pending. You can save without a price.')}</p>
      <div className={styles.controls}>
        <Select id="wall-price-book" labelText={t('País de entrega y moneda','Destination country and currency')} value={bookId} onChange={event => onBookChange(event.target.value)}>
          {!books.length && <SelectItem value="" text={t('Sin listas de precios','No price books')} />}
          <SelectItem value="" text={t('Seleccionar mercado','Select market')} />
          {books.map(book => <SelectItem key={book.id} value={book.id} text={`${displayNames.of(book.country)} · ${book.currency} · ${book.name}`} />)}
        </Select>
        <Button type="button" disabled={busy || !activeBook} onClick={onLoadCosts}>{t('Consultar costos','Get costs')}</Button>
        <TextInput id="wall-margin" labelText={t('Margen de fabricación (%)','Manufacturing margin (%)')} min="0" max="99" type="number" value={margin}
          onChange={event => write(previous=>({...previous,margin:event.target.value}))} />
        <Button type="button" kind="tertiary" disabled={busy || !costs[bookId] || margin === '' || Number(margin) < 0 || Number(margin) >= 100}
          onClick={applyMargin}>{t('Aplicar margen','Apply margin')}</Button>
      </div>
      {activeBook && <div className={styles.table}><table>
        <thead><tr><th>{t('Variante','Variant')}</th><th>{t('Fabricación','Manufacturing')}</th><th>{t('Envío','Shipping')}</th>
          <th>{t('Precio de venta','Retail price')}</th><th>{t('Margen de fabricación','Manufacturing margin')}</th></tr></thead>
        <tbody>{selected.map(item => {
          const cost = costs[bookId]?.[item.id]
          const value = prices[bookId]?.[item.rowKey] ?? ''
          const retail = amountMinor(value, activeBook.currency)
          const profit = retail > 0 && cost?.manufacturingMinor != null ? Math.round(100 * (retail - cost.manufacturingMinor) / retail) : null
          return <tr key={item.rowKey}>
            <td>{titleFor(item)} · {Object.values(item.variant.attributes).map(value=>t(...studioValue(value))).join(' · ')}</td>
            <td>{cost?.manufacturingMinor != null ? currencyLabel(cost.manufacturingMinor,activeBook.currency)
              : cost ? t('Sin costo verificable','Cost unavailable') : '—'}</td>
            <td>{t('Por confirmar','Pending')}</td>
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
