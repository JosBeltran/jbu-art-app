'use client'
import { getAvailability, publicStatusLabel } from '@/lib/artworkStatus'
import { localizedSeriesName, getLocalizedSeriesContent } from '@/lib/seriesContent'
import { catalogArtworkType, catalogQueryHref } from '@/lib/catalogUrl'
import { useMarket } from '@/components/market/MarketProvider'
import { selectedCountry, itemAvailableInCountry } from '@/lib/countryAvailability'
import { sameSeries, uniqueArtworkSeries, resolveSeriesValue, matchesSeriesFilter } from '@/lib/catalogSeries'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Button,
  Checkbox,
  Dropdown,
  Pagination,
  Search,
  Select,
  SelectItem,
} from '@carbon/react'
import { editionAvailability, editionDesignation, isPhysicalEdition } from '@/lib/physicalEdition'
import { getArtworkCommercePresentation } from '@/lib/artworkCommerce'
import { Reset } from '@carbon/icons-react'
import { artworkPrintHref } from '@/lib/printRoutes'
import { originalArtworkImage } from '@/lib/artworkMedia'
import EditorialCard from '@/components/catalog/EditorialCard'
import FilterToolbar from '@/components/catalog/FilterToolbar'
import styles from './Catalog.module.css'
import { useI18n, useLocalized } from '@/components/I18nProvider'
import { useCurrency } from '@/components/CurrencyProvider'

type Artwork = {
  id: string
  sku?: string
  title?: string
  series?: string
  medium?: string
  dimensions?: string
  year?: number
  status?: string
  ownership_status?: string
  availability_status?: string
  primary_image_url?: string
  image_url?: string
  image?: string
  calculated_price_mxn?: number
  base_price_mxn?: number
  price_display_mode?: string
  allowed_shipping_countries?: string[] | null
  created_at?: string
  stripe_url?: string
  physical_edition_type?: string
  physical_edition_size?: number
  editionCounts?: { edition_size: number; available: number; reserved: number; sold: number; sales_enabled: boolean }
}

type Option = { id: string; text: string }

function getStatusOptions(t: (es: string, en: string) => string) {
  return [
    { id: 'ALL', text: t('Todas', 'All') },
    { id: 'AVAILABLE', text: t('Disponibles', 'Available') },
    { id: 'SOLD', text: t('No disponibles', 'Unavailable') },
  ]
}

function getSortOptions(t: (es: string, en: string) => string): Option[] {
  return [
    { id: 'RECENT', text: t('Más recientes', 'Most recent') },
    { id: 'PRICE_ASC', text: t('Precio: menor a mayor', 'Price: low to high') },
    { id: 'PRICE_DESC', text: t('Precio: mayor a menor', 'Price: high to low') },
    { id: 'TITLE', text: t('Título A–Z', 'Title A–Z') },
  ]
}

function artworkStatus(artwork: Artwork) {
  return getAvailability(artwork)
}

function artworkPrice(artwork: Artwork) {
  return Number(artwork.base_price_mxn || artwork.calculated_price_mxn || 0)
}

export default function CatalogClient({ initialArtworks = [], seriesNames = [], printArtworkIds = [], printImageMap = {}, countryOptions = [], landingSeries = null, landingPrints = false }: { initialArtworks?: Artwork[]; seriesNames?: any[]; printArtworkIds?: string[]; countryOptions?: string[]; printImageMap?: Record<string, { general?: string | null; startingPriceMxn?: number | null }>; landingSeries?: string | null; landingPrints?: boolean }) {
  const { t, locale, lang } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hasPrints = useMemo(() => new Set(printArtworkIds), [printArtworkIds])
  const { price: displayPrice } = useCurrency()
  const seriesLabel = (name?: string) => localizedSeriesName(name, seriesNames, lang)
  const L = useLocalized()
  const STATUS_OPTIONS = useMemo(() => getStatusOptions(t), [t])
  const SORT_OPTIONS = useMemo(() => getSortOptions(t), [t])
  const searchQuery = searchParams.get('q') || ''
  const market = useMarket()
  const selectedCountryCode = searchParams.has('country') ? selectedCountry(searchParams.get('country')) : market.country
  const artworkType = catalogArtworkType(searchParams.get('type'))
  const artworkTypeOptions = [
    { id: 'ALL', text: t('Todas las obras', 'All Artworks') },
    { id: 'UNIQUE', text: t('Originales únicos', 'Unique Originals') },
    { id: 'LIMITED_EDITION', text: t('Ediciones físicas limitadas', 'Physical Limited Editions') },
  ]
  const requestedPage = Number(searchParams.get('page'))
  const pageSize = 24
  const selectedCountryValue = selectedCountryCode || 'ALL'
  const countryChoices = useMemo(() => {
    const display = new Intl.DisplayNames([lang === 'en' ? 'en' : 'es'], { type: 'region' })
    return [{ id: 'ALL', text: t('Todos los países', 'All Countries') },
      ...countryOptions.map(code => ({ id: code, text: display.of(code) || code }))]
  }, [countryOptions, lang, t])
  const [selectedSeries, setSelectedSeries] = useState(() =>
    resolveSeriesValue(landingSeries || searchParams.get('series'), initialArtworks, seriesNames, lang)
  )
  const statusFilter = STATUS_OPTIONS.find(option => option.id === searchParams.get('status'))?.id || 'ALL'
  const [printsOnly, setPrintsOnly] = useState(() => landingPrints || searchParams.get('prints') === 'true')
  const sortOrder = SORT_OPTIONS.find(option => option.id === searchParams.get('sort'))?.id || 'RECENT'

  // The URL is authoritative for shareable filters; Next navigation handles
  // client-side transitions and back/forward restores these two controls.
  useEffect(() => {
    setSelectedSeries(resolveSeriesValue(landingSeries || searchParams.get('series'), initialArtworks, seriesNames))
    setPrintsOnly(landingPrints || searchParams.get('prints') === 'true')
  }, [searchParams, initialArtworks, seriesNames, landingSeries, landingPrints, lang])

  function updateCatalogQuery(changes: { series?: string; prints?: boolean; country?: string; artworkType?: string; clear?: boolean }) {
    if (changes.country && changes.country !== 'ALL') market.setCountry(changes.country)
    // Fixed /series/[slug] pages must navigate to the canonical catalog
    // when a visitor selects another series. Otherwise landingSeries
    // silently restores the original selection on the next render.
    const query = new URLSearchParams(searchParams)
    query.delete('page')
    if (changes.clear) for (const key of ['q', 'sort', 'status']) query.delete(key)
    const keepLanding = landingSeries && changes.series === undefined
    router.push(catalogQueryHref(keepLanding ? pathname : '/catalog', query.toString(), {
      ...(landingPrints ? { prints: true } : {}),
      ...(landingSeries && !keepLanding && !searchParams.get('series') ? { series: landingSeries } : {}),
      ...changes,
    }), { scroll: false })
  }

  const seriesOptions = useMemo<Option[]>(() => {
    const values = uniqueArtworkSeries(initialArtworks, seriesNames, lang)
    // A country may temporarily yield zero works in an otherwise valid series.
    // Keep its URL-selected option visible rather than silently resetting it.
    if (selectedSeries !== 'ALL' && !values.some(value => matchesSeriesFilter(value, selectedSeries, seriesNames, lang)))
      values.push(selectedSeries)
    return [{ id: 'ALL', text: t('Todas las series', 'All series') }, ...values.map((value) => ({ id: value, text: seriesLabel(value) }))]
  }, [initialArtworks, t, seriesNames, lang, selectedSeries])

  const filteredArtworks = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase(locale)
    const matches = initialArtworks.filter((artwork) => {
      const haystack = [L(artwork, 'title'), L(artwork, 'medium'), artwork.series, seriesLabel(artwork.series), artwork.sku].filter(Boolean).join(' ').toLocaleLowerCase(locale)
      const editionState = !printsOnly && isPhysicalEdition(artwork) ? editionAvailability(artwork.editionCounts) : null
      const status = editionState ? (['limited', 'available'].includes(editionState) && artworkStatus(artwork) === 'AVAILABLE' ? 'AVAILABLE' : 'SOLD') : artworkStatus(artwork)
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'AVAILABLE' ? status === 'AVAILABLE' : status !== 'AVAILABLE')
      return (!query || haystack.includes(query)) && (selectedSeries === 'ALL' || matchesSeriesFilter(artwork.series, selectedSeries, seriesNames, lang)) && matchesStatus && (printsOnly ? hasPrints.has(String(artwork.id)) : itemAvailableInCountry(artwork, selectedCountryCode))
    })

    const priceForSort = (artwork: Artwork) => printsOnly ? printImageMap[artwork.id]?.startingPriceMxn || 0 : artworkPrice(artwork)
    return [...matches].sort((a, b) => {
      if (sortOrder === 'PRICE_ASC') return priceForSort(a) - priceForSort(b)
      if (sortOrder === 'PRICE_DESC') return priceForSort(b) - priceForSort(a)
      if (sortOrder === 'TITLE') return String(L(a, 'title') || '').localeCompare(String(L(b, 'title') || ''), locale)
      return String(b.created_at || '').localeCompare(String(a.created_at || ''))
    })
  }, [initialArtworks, searchQuery, selectedSeries, statusFilter, sortOrder, printsOnly, hasPrints, L, locale, seriesNames, lang, selectedCountryCode, printImageMap])

  const page = Math.min(Math.max(1, Math.ceil(filteredArtworks.length / pageSize)), Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1)
  const displayedArtworks = filteredArtworks.slice((page - 1) * pageSize, page * pageSize)

  function updateLocalFilter(key: string, value?: string) {
    const query = new URLSearchParams(window.location.search)
    query.delete('page')
    if (value) query.set(key, value)
    else query.delete(key)
    window.history.replaceState(null, '', catalogQueryHref(pathname, query.toString()))
  }

  function changePage(next: number) {
    const query = new URLSearchParams(searchParams)
    if (next > 1) query.set('page', String(next))
    else query.delete('page')
    router.push(catalogQueryHref(pathname, query.toString()), { scroll: false })
  }

  const hasActiveFilters = Boolean(searchQuery.trim() || selectedSeries !== 'ALL' || statusFilter !== 'ALL' || printsOnly || selectedCountryCode || artworkType !== 'ALL' || sortOrder !== 'RECENT')
  const activeFilterCount = Number(Boolean(searchQuery.trim())) + Number(selectedSeries !== 'ALL') + Number(statusFilter !== 'ALL') + Number(printsOnly) + Number(sortOrder !== 'RECENT') + Number(artworkType !== 'ALL')
  const selectedSeriesOption = seriesOptions.find((option) => matchesSeriesFilter(option.id, selectedSeries, seriesNames, lang) || (option.id === 'ALL' && selectedSeries === 'ALL')) || seriesOptions[0]
  const seriesRow = selectedSeries !== 'ALL'
    ? seriesNames.find((s) => sameSeries(s.title, selectedSeries))
    : null
  const seriesContent = getLocalizedSeriesContent(seriesRow, lang)
  const selectedSortOption = SORT_OPTIONS.find((option) => option.id === sortOrder) || SORT_OPTIONS[0]

  function clearFilters() {
    setSelectedSeries('ALL')
    setPrintsOnly(false)
    updateCatalogQuery({ series: 'ALL', prints: false, country: 'ALL', artworkType: 'ALL', clear: true })
  }

  return (
    <>
      <FilterToolbar label={t('Filtros', 'Filters')} count={activeFilterCount} destination={<Dropdown
          id="country-filter"
          titleText={t('País de entrega', 'Delivery country')}
          label={t('Todos los países', 'All Countries')}
          items={countryChoices}
          itemToString={(item) => item?.text || ''}
          selectedItem={countryChoices.find(option => option.id === selectedCountryValue) || countryChoices[0]}
          onChange={({ selectedItem }) => updateCatalogQuery({ country: selectedItem?.id || 'ALL' })}
        />} >
      <section className={styles.filterSection}>
        <span className={styles.filterLabel}>{t('Buscar', 'Search')}</span>
        <Search
          id="artwork-search"
          size="md"
          labelText={t('Buscar', 'Search')}
          placeholder={t('Título, técnica, serie o SKU', 'Title, technique, series or SKU')}
          value={searchQuery}
          onChange={(event) => updateLocalFilter('q', event.target.value)}
          onClear={() => updateLocalFilter('q')}
          closeButtonLabelText={t('Limpiar búsqueda', 'Clear search')}
        />
      </section>

      <section className={styles.filterSection}>
        <Dropdown
          id="series-filter"
          titleText={t('Serie', 'Series')}
          label={t('Selecciona una serie', 'Select a series')}
          items={seriesOptions}
          itemToString={(item) => item?.text || ''}
          selectedItem={selectedSeriesOption}
          onChange={({ selectedItem }) => {
            const next = selectedItem?.id || 'ALL'
            setSelectedSeries(next)
            updateCatalogQuery({ series: next })
          }}
        />
      </section>

      {!printsOnly && <section className={styles.filterSection}>
        <Dropdown id="catalog-artwork-type"
          titleText={t('Tipo de obra', 'Artwork type')} label={artworkTypeOptions[0].text}
          items={artworkTypeOptions} itemToString={item => item?.text || ''}
          selectedItem={artworkTypeOptions.find(item => item.id === artworkType)}
          onChange={({ selectedItem }) => updateCatalogQuery({ artworkType: selectedItem?.id || 'ALL' })} />
      </section>}
      <section className={styles.filterSection}>
        <Select id="catalog-status" labelText={t('Disponibilidad', 'Availability')} value={statusFilter}
          onChange={event => updateLocalFilter('status', event.target.value === 'ALL' ? undefined : event.target.value)}>
          {STATUS_OPTIONS.map(option => <SelectItem key={option.id} value={option.id} text={option.text} />)}
        </Select>
      </section>

      <section className={styles.filterSection}>
        <Checkbox
          id="prints-only"
          labelText={t('¿Tiene prints disponibles?', 'Prints Available')}
          checked={printsOnly}
          onChange={(_event, { checked }) => {
            setPrintsOnly(Boolean(checked))
            updateCatalogQuery({ prints: Boolean(checked) })
          }}
        />
      </section>

      <section className={styles.filterSection}><Dropdown
                id="catalog-sort"
                titleText={t('Ordenar', 'Sort')}
                label={t('Ordenar', 'Sort')}
                items={SORT_OPTIONS}
                itemToString={(item) => item?.text || ''}
                selectedItem={selectedSortOption}
                onChange={({ selectedItem }) => updateLocalFilter('sort', selectedItem?.id === 'RECENT' ? undefined : selectedItem?.id)}
                size="sm"
              /></section>
      {hasActiveFilters && (
        <div className={styles.filterActions}>
          <Button kind="ghost" size="sm" renderIcon={Reset} onClick={clearFilters}>{t('Limpiar filtros', 'Clear filters')}</Button>
        </div>
      )}
      </FilterToolbar>
        <section className={styles.results} aria-live="polite">
          <header className={styles.resultHeader}>
            <div>
              <p className={styles.kicker}>{t('Obras', 'Artworks')}</p>
              <h2 className={styles.resultTitle}>{seriesRow ? seriesContent.name || selectedSeriesOption?.text : selectedSeriesOption?.text}</h2>
              {seriesRow && <div className={styles.seriesContext}>
                {seriesContent.subtitle && <p className={styles.seriesSubtitle}>{seriesContent.subtitle}</p>}
                {seriesContent.shortDescription && <p className={styles.seriesDescription}>{seriesContent.shortDescription}</p>}
                {seriesContent.description && seriesContent.description !== seriesContent.shortDescription && <details className={styles.seriesMore}>
                  <summary>{t('Acerca de esta serie', 'About this series')}</summary>
                  <p>{seriesContent.description}</p>
                </details>}
              </div>}
            </div>
            <span className={styles.count}>{filteredArtworks.length} {t('obras', 'artworks')}</span>
          </header>

          {filteredArtworks.length === 0 ? (
            <div className={styles.empty}>
              <h3>{t('Sin resultados', 'No results')}</h3>
              <p>{t('Prueba otra búsqueda o limpia los filtros.', 'Try another search or clear the filters.')}</p>
              <Button kind="tertiary" onClick={clearFilters}>{t('Ver todo', 'View all')}</Button>
            </div>
          ) : (
            <div className={styles.grid}>
              {displayedArtworks.map((artwork) => {
                const status = artworkStatus(artwork)
                const commerce = getArtworkCommercePresentation(artwork)
                const printInfo = printImageMap[artwork.id]
                const title = L(artwork, 'title') || artwork.sku || ''
                const edition = isPhysicalEdition(artwork)
                const country = searchParams.get('country') || selectedCountryCode || undefined
                const printsHref = artworkPrintHref(artwork.sku || '', { country })
                const originalHref = '/artwork/' + encodeURIComponent(artwork.sku || '') +
                  (country ? '?' + new URLSearchParams({ country }) : '')
                return <EditorialCard key={artwork.id} heading="h3" title={title} sku={artwork.sku}
                  href={originalHref}
                  image={printInfo ? printInfo.general : originalArtworkImage(artwork)}
                  status={edition ? editionDesignation(artwork.physical_edition_size, t)
                    : status === 'SOLD' ? t('Vendida', 'Sold') : null}
                  context={[seriesLabel(artwork.series), artwork.year, !edition && status !== 'SOLD' && publicStatusLabel(artwork, t)].filter(Boolean).join(' · ')}
                  price={printsOnly && printInfo?.startingPriceMxn ? t('Prints desde ', 'Prints from ') + displayPrice(printInfo.startingPriceMxn).text
                    : !printsOnly && commerce.showPrice ? displayPrice(commerce.price).text : null}
                  secondary={hasPrints.has(artwork.id) ?
                    <Link href={printsHref}>{t('Explorar Fine Art Prints', 'Explore Fine Art Prints')}</Link> : null} />
              })}
            </div>
          )}
          {filteredArtworks.length > pageSize && <Pagination page={page} pageSize={pageSize} pageSizes={[pageSize]}
            totalItems={filteredArtworks.length} pageSizeInputDisabled
            itemsPerPageText={t('Obras por página', 'Artworks per page')}
            backwardText={t('Página anterior', 'Previous page')} forwardText={t('Página siguiente', 'Next page')}
            onChange={({ page: next }) => changePage(next)} />}
        </section>
    </>
  )
}
