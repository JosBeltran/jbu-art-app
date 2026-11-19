'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button, Pagination, Search, Select, SelectItem } from '@carbon/react'
import { Reset } from '@carbon/icons-react'
import { useMarket } from '@/components/market/MarketProvider'
import { browsingCountry } from '@/lib/market'
import { artworkPrintHref } from '@/lib/printRoutes'
import { catalogMoney, marketVariant } from '@/lib/productCatalog/commerce'
import { useCurrency } from '@/components/CurrencyProvider'
import { useI18n } from '@/components/I18nProvider'
import EditorialCard from '@/components/catalog/EditorialCard'
import FilterToolbar from '@/components/catalog/FilterToolbar'
import styles from '@/app/catalog/Catalog.module.css'

const pageSize = 24

export default function PrintCollection({ options, countries = [] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const market = useMarket()
  const country = browsingCountry(params.get('country'), market.country)
  const { t, locale } = useI18n()
  const { price, chargeCurrency } = useCurrency()
  const query = params.get('q') || ''
  const size = params.get('size') || ''
  const edition = params.get('edition') || ''
  const series = params.get('series') || ''
  const sort = params.get('sort') || ''
  const phrase = query.trim().toLocaleLowerCase(locale)
  const countryNames = new Intl.DisplayNames([locale], { type: 'region' })

  function update(key, value) {
    const next = new URLSearchParams(window.location.search)
    next.delete('page')
    if (key === 'country') {
      next.set(key, value || 'ALL')
      if (value) market.setCountry(value)
      router.push(pathname + '?' + next, { scroll: false })
      return
    }
    if (key === 'page') {
      if (value > 1) next.set(key, value)
    } else if (key) {
      if (value) next.set(key, value)
      else next.delete(key)
    } else {
      for (const key of ['q', 'size', 'edition', 'series', 'sort']) next.delete(key)
    }
    window.history.replaceState(null, '', pathname + (next.size ? '?' + next : ''))
  }

  const sizes = [...new Set(options.map(row => row.size).filter(Boolean))].sort()
  const collections = [...new Set(options.map(row => row.series).filter(Boolean))].sort()
  const replacements = new Set(options.filter(row => row.commercial && marketVariant(row,country,chargeCurrency)).map(row=>row.replacesPrintId))
  const groups = new Map()
  for (const option of options) {
    if (!option.commercial && replacements.has(option.id)) continue
    const quote = option.commercial && country ? marketVariant(option,country,chargeCurrency) : null
    const row = option.commercial ? { ...option, price:quote?.amountMinor / 100 || null } : option
    if ((size && row.size !== size) || (edition && row.edition !== edition) || (series && row.series !== series) ||
      ![row.title, row.titleEn, row.artworkTitle, row.artworkTitleEn, row.size].filter(Boolean).join(' ').toLocaleLowerCase(locale).includes(phrase)) continue
    if (!groups.has(row.artworkSku)) groups.set(row.artworkSku, [])
    groups.get(row.artworkSku).push(row)
  }
  const records = [...groups.values()].map(rows => ({
    ...rows[0],
    startingPrice: rows[0].commercial
      ? rows.filter(row => row.commercial && row.price != null).reduce((min,row)=>Math.min(min ?? Infinity,row.price),null)
      : Math.min(...rows.filter(row => !row.commercial).map(row => row.price)),
    editions: [...new Set(rows.map(row => row.edition))],
    multiplePrices: rows.some(row => row.price !== rows[0].price),
  }))
  if (sort === 'price') records.sort((a, b) => (a.startingPrice ?? Infinity) - (b.startingPrice ?? Infinity))
  if (sort === 'title') records.sort((a, b) => t(a.artworkTitle, a.artworkTitleEn).localeCompare(t(b.artworkTitle, b.artworkTitleEn), locale))
  const page = Math.min(Math.max(1, Math.ceil(records.length / pageSize)), Math.max(1, Number.parseInt(params.get('page'), 10) || 1))
  const count = [phrase, size, edition, series, sort].filter(Boolean).length

  return <>
    <FilterToolbar label={t('Filtros', 'Filters')} count={count} destination={
      <Select id="print-collection-country" labelText={t('País de entrega', 'Delivery country')} value={country || ''} onChange={event => update('country', event.target.value)}>
        <SelectItem value="" text={t('Todos los países', 'All Countries')} />
        {countries.map(code => <SelectItem key={code} value={code} text={countryNames.of(code) || code} />)}
      </Select>
    }>
      <Search id="print-collection-search" labelText={t('Buscar prints', 'Search prints')} placeholder={t('Buscar por título o tamaño', 'Search by title or size')}
        value={query} onChange={event => update('q', event.target.value)} onClear={() => update('q')} />
      <Select id="print-collection-size" labelText={t('Tamaño', 'Size')} value={size} onChange={event => update('size', event.target.value)}>
        <SelectItem value="" text={t('Todos los tamaños', 'All sizes')} />
        {[...new Set([...(size ? [size] : []), ...sizes])].map(item => <SelectItem key={item} value={item} text={item} />)}
      </Select>
      <Select id="print-collection-series" labelText={t('Serie', 'Series')} value={series} onChange={event => update('series', event.target.value)}>
        <SelectItem value="" text={t('Todas las series', 'All series')} />
        {[...new Set([...(series ? [series] : []), ...collections])].map(item => <SelectItem key={item} value={item} text={item} />)}
      </Select>
      <Select id="print-collection-edition" labelText={t('Edición', 'Edition')} value={edition} onChange={event => update('edition', event.target.value)}>
        <SelectItem value="" text={t('Todas las ediciones', 'All editions')} />
        <SelectItem value="OPEN" text={t('Edición abierta', 'Open Edition')} />
        <SelectItem value="LIMITED" text={t('Edición limitada', 'Limited Edition')} />
      </Select>
      <Select id="print-collection-sort" labelText={t('Ordenar', 'Sort')} value={sort} onChange={event => update('sort', event.target.value)}>
        <SelectItem value="" text={t('Selección del estudio', 'Studio selection')} />
        <SelectItem value="price" text={t('Precio: menor a mayor', 'Price: low to high')} />
        <SelectItem value="title" text={t('Título A–Z', 'Title A–Z')} />
      </Select>
      {count > 0 && <Button kind="ghost" size="sm" renderIcon={Reset} onClick={() => update()}>{t('Limpiar filtros', 'Clear filters')}</Button>}
    </FilterToolbar>
    {!records.length && <p className={styles.empty}>{t('No hay prints disponibles para esta selección.', 'No prints are available for this selection.')}</p>}
    <div className={styles.grid}>
      {records.slice((page - 1) * pageSize, page * pageSize).map(row => {
        const title = t(row.artworkTitle, row.artworkTitleEn)
        const editions = row.editions.map(value => value === 'OPEN' ? t('Edición abierta', 'Open Edition') : t('Edición limitada', 'Limited Edition'))
        const href = artworkPrintHref(row.artworkSku, { variant: row.id, country: params.get('country') || country })
        return <EditorialCard key={row.artworkSku} href={href} image={row.image} sku={row.artworkSku} title={title}
          context={[size, ...editions].filter(Boolean).join(' · ')} price={row.startingPrice == null ? t('Consultar por destino','Check by destination')
            : (row.multiplePrices ? t('Desde ', 'From ') : '') + (row.commercial
              ? catalogMoney(Math.round(row.startingPrice*100),chargeCurrency,locale) : price(row.startingPrice).text)} />
      })}
    </div>
    {records.length > pageSize && <Pagination page={page} pageSize={pageSize} pageSizes={[pageSize]} totalItems={records.length}
      pageSizeInputDisabled itemsPerPageText={t('Obras por página', 'Artworks per page')}
      backwardText={t('Página anterior', 'Previous page')} forwardText={t('Página siguiente', 'Next page')}
      onChange={({ page: next }) => update('page', next)} />}
  </>
}
