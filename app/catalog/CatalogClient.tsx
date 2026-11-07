'use client'
import { getAvailability, publicStatusLabel } from '@/lib/artworkStatus'
import { localizedSeriesName, getLocalizedSeriesContent } from '@/lib/seriesContent'
import { catalogQueryHref } from '@/lib/catalogUrl'
import { sameSeries, uniqueArtworkSeries, resolveSeriesValue, matchesSeriesFilter } from '@/lib/catalogSeries'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Button,
  Checkbox,
  ContentSwitcher,
  Dropdown,
  Modal,
  Search,
  Switch,
  Tag,
} from '@carbon/react'
import { Filter, Reset, ShoppingCart, Printer } from '@carbon/icons-react'
import ArtworkImage from '@/components/ArtworkImage'
import AskForPriceButton from '@/components/AskForPriceButton'
import { getArtworkCommercePresentation } from '@/lib/artworkCommerce'
import { useCart } from '@/context/CartContext'
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
  created_at?: string
  stripe_url?: string
}

type Option = { id: string; text: string }

function getStatusOptions(t: (es: string, en: string) => string) {
  return [
    { id: 'ALL', text: t('Todas', 'All') },
    { id: 'AVAILABLE', text: t('Disponibles', 'Available') },
    { id: 'SOLD', text: t('Privadas', 'Private') },
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

export default function CatalogClient({ initialArtworks = [], seriesNames = [], printArtworkIds = [], printImageMap = {}, siteSettings = null, landingSeries = null, landingPrints = false }: { initialArtworks?: Artwork[]; seriesNames?: any[]; printArtworkIds?: string[]; printImageMap?: Record<string, { general?: string | null; prints?: string | null; startingPriceMxn?: number | null }>; siteSettings?: any; landingSeries?: string | null; landingPrints?: boolean }) {
  const { t, locale, lang } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hasPrints = useMemo(() => new Set(printArtworkIds), [printArtworkIds])
  const { price: displayPrice } = useCurrency()
  const { addToCart } = useCart()
  const [addedSku, setAddedSku] = useState<string | null>(null)
  const seriesLabel = (name?: string) => localizedSeriesName(name, seriesNames, lang)
  const L = useLocalized()
  const STATUS_OPTIONS = useMemo(() => getStatusOptions(t), [t])
  const SORT_OPTIONS = useMemo(() => getSortOptions(t), [t])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSeries, setSelectedSeries] = useState(() =>
    resolveSeriesValue(landingSeries || searchParams.get('series'), initialArtworks, seriesNames, lang)
  )
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [printsOnly, setPrintsOnly] = useState(() => landingPrints || searchParams.get('prints') === 'true')
  const [sortOrder, setSortOrder] = useState('RECENT')
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false)

  // The URL is authoritative for shareable filters; Next navigation handles
  // client-side transitions and back/forward restores these two controls.
  useEffect(() => {
    setSelectedSeries(resolveSeriesValue(landingSeries || searchParams.get('series'), initialArtworks, seriesNames))
    setPrintsOnly(landingPrints || searchParams.get('prints') === 'true')
  }, [searchParams, initialArtworks, seriesNames, landingSeries, landingPrints, lang])

  function updateCatalogQuery(changes: { series?: string; prints?: boolean }) {
    // Fixed /series/[slug] pages must navigate to the canonical catalog
    // when a visitor selects another series. Otherwise landingSeries
    // silently restores the original selection on the next render.
    router.push(catalogQueryHref('/catalog', pathname === '/catalog' ? searchParams.toString() : '', {
      ...(landingPrints ? { prints: true } : {}),
      ...changes,
    }), { scroll: false })
  }

  const seriesOptions = useMemo<Option[]>(() => {
    const values = uniqueArtworkSeries(initialArtworks, seriesNames, lang)
    return [{ id: 'ALL', text: t('Todas las series', 'All series') }, ...values.map((value) => ({ id: value, text: seriesLabel(value) }))]
  }, [initialArtworks, t, seriesNames, lang])

  const filteredArtworks = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase(locale)
    const matches = initialArtworks.filter((artwork) => {
      const haystack = [L(artwork, 'title'), L(artwork, 'medium'), artwork.series, seriesLabel(artwork.series), artwork.sku].filter(Boolean).join(' ').toLocaleLowerCase(locale)
      const status = artworkStatus(artwork)
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'AVAILABLE' ? status === 'AVAILABLE' : status !== 'AVAILABLE')
      return (!query || haystack.includes(query)) && (selectedSeries === 'ALL' || matchesSeriesFilter(artwork.series, selectedSeries, seriesNames, lang)) && matchesStatus && (!printsOnly || hasPrints.has(String(artwork.id)))
    })

    return [...matches].sort((a, b) => {
      if (sortOrder === 'PRICE_ASC') return artworkPrice(a) - artworkPrice(b)
      if (sortOrder === 'PRICE_DESC') return artworkPrice(b) - artworkPrice(a)
      if (sortOrder === 'TITLE') return String(L(a, 'title') || '').localeCompare(String(L(b, 'title') || ''), locale)
      return String(b.created_at || '').localeCompare(String(a.created_at || ''))
    })
  }, [initialArtworks, searchQuery, selectedSeries, statusFilter, sortOrder, printsOnly, hasPrints, L, locale, seriesNames, lang])

  const hasActiveFilters = Boolean(searchQuery.trim() || selectedSeries !== 'ALL' || statusFilter !== 'ALL' || printsOnly)
  const activeFilterCount = Number(Boolean(searchQuery.trim())) + Number(selectedSeries !== 'ALL') + Number(statusFilter !== 'ALL') + Number(printsOnly)
  const selectedSeriesOption = seriesOptions.find((option) => matchesSeriesFilter(option.id, selectedSeries, seriesNames, lang) || (option.id === 'ALL' && selectedSeries === 'ALL')) || seriesOptions[0]
  const seriesRow = selectedSeries !== 'ALL'
    ? seriesNames.find((s) => sameSeries(s.title, selectedSeries))
    : null
  const seriesContent = getLocalizedSeriesContent(seriesRow, lang)
  const selectedSortOption = SORT_OPTIONS.find((option) => option.id === sortOrder) || SORT_OPTIONS[0]

  function clearFilters() {
    setSearchQuery('')
    setSelectedSeries('ALL')
    setPrintsOnly(false)
    updateCatalogQuery({ series: 'ALL', prints: false })
    setStatusFilter('ALL')
  }

  const filters = (mobile = false) => (
    <div>
      <section className={styles.filterSection}>
        <span className={styles.filterLabel}>{t('Buscar', 'Search')}</span>
        <Search
          id={mobile ? 'mobile-artwork-search' : 'artwork-search'}
          size="md"
          labelText={t('Buscar', 'Search')}
          placeholder={t('Título, técnica, serie o SKU', 'Title, technique, series or SKU')}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onClear={() => setSearchQuery('')}
          closeButtonLabelText={t('Limpiar búsqueda', 'Clear search')}
        />
      </section>

      <section className={styles.filterSection}>
        <Dropdown
          id={mobile ? 'mobile-series-filter' : 'series-filter'}
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

      <section className={styles.filterSection}>
        <span className={styles.filterLabel}>{t('Disponibilidad', 'Availability')}</span>
        <ContentSwitcher
          selectedIndex={STATUS_OPTIONS.findIndex((option) => option.id === statusFilter)}
          onChange={({ index }) => {
            const option = typeof index === 'number' ? STATUS_OPTIONS[index] : undefined
            setStatusFilter(option?.id || 'ALL')
          }}
          size="sm"
        >
          {STATUS_OPTIONS.map((option) => <Switch key={option.id} name={option.id} text={option.text} />)}
        </ContentSwitcher>
      </section>

      <section className={styles.filterSection}>
        <Checkbox
          id={mobile ? 'mobile-prints-only' : 'prints-only'}
          labelText={t('¿Tiene prints disponibles?', 'Prints Available')}
          checked={printsOnly}
          onChange={(_event, { checked }) => {
            setPrintsOnly(Boolean(checked))
            updateCatalogQuery({ prints: Boolean(checked) })
          }}
        />
      </section>

      {hasActiveFilters && (
        <div className={styles.filterActions}>
          <Button kind="ghost" size="sm" renderIcon={Reset} onClick={clearFilters}>{t('Limpiar filtros', 'Clear filters')}</Button>
        </div>
      )}
    </div>
  )

  return (
    <>
      <Modal
        open={isFilterPanelOpen}
        onRequestClose={() => setIsFilterPanelOpen(false)}
        modalHeading={t('Filtrar catálogo', 'Filter catalog')}
        modalLabel={t('Obras', 'Artworks')}
        primaryButtonText={`${t('Ver', 'View')} ${filteredArtworks.length}`}
        secondaryButtonText={t('Cancelar', 'Cancel')}
        onRequestSubmit={() => setIsFilterPanelOpen(false)}
        onSecondarySubmit={() => setIsFilterPanelOpen(false)}
      >
        {filters(true)}
      </Modal>

      <div className={styles.mobileOnly}>
        <div className={styles.mobileToolbar}>
          <span className={styles.count}>{filteredArtworks.length} {t('obras', 'artworks')}</span>
          <Button kind="ghost" size="sm" renderIcon={Filter} onClick={() => setIsFilterPanelOpen(true)}>
            {t('Filtros', 'Filters')}{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </Button>
        </div>
      </div>

      <div className={styles.layout}>
        <aside className={`${styles.sidebar} ${styles.desktopOnly}`} aria-label={t('Filtros del catálogo', 'Catalog filters')}>
          <span className={styles.filterLabel}>{t('Explorar', 'Explore')}</span>
          {filters()}
        </aside>

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
            <div className={styles.desktopOnly}>
              <Dropdown
                id="catalog-sort"
                titleText={t('Ordenar', 'Sort')}
                label={t('Ordenar', 'Sort')}
                items={SORT_OPTIONS}
                itemToString={(item) => item?.text || ''}
                selectedItem={selectedSortOption}
                onChange={({ selectedItem }) => setSortOrder(selectedItem?.id || 'RECENT')}
                size="sm"
              />
            </div>
          </header>

          {filteredArtworks.length === 0 ? (
            <div className={styles.empty}>
              <h3>{t('Sin resultados', 'No results')}</h3>
              <p>{t('Prueba otra búsqueda o limpia los filtros.', 'Try another search or clear the filters.')}</p>
              <Button kind="tertiary" onClick={clearFilters}>{t('Ver todo', 'View all')}</Button>
            </div>
          ) : (
            <div className={styles.grid}>
              {filteredArtworks.map((artwork) => {
                const available = artworkStatus(artwork) === 'AVAILABLE'
                const commerce = getArtworkCommercePresentation(artwork)
                const hasPrintOption = hasPrints.has(String(artwork.id))
                const printInfo = printImageMap[String(artwork.id)]
                const promotePrint = hasPrintOption && (!available || printsOnly)
                return (
                  <article key={artwork.id} className={styles.card}>
                    <Link href={`/artwork/${artwork.sku}${printsOnly ? '#prints' : ''}`} className={styles.imageLink} aria-label={L(artwork, 'title')}>
                      <ArtworkImage
                        key={`${artwork.id}:${printsOnly ? "prints" : "general"}`}
                        title={L(artwork, 'title')}
                        primaryUrl={(printsOnly ? printImageMap[String(artwork.id)]?.prints : printImageMap[String(artwork.id)]?.general) || artwork.primary_image_url || artwork.image_url || artwork.image}
                        sku={artwork.sku}
                        className={styles.image}
                      />
                      <span className={styles.tag}>
                        <Tag type={printsOnly ? 'purple' : available ? 'green' : 'gray'} size="sm">{printsOnly ? t('FINE ART PRINT', 'FINE ART PRINT') : artworkStatus(artwork) === 'SOLD' ? t('VENDIDO', 'SOLD') : publicStatusLabel(artwork, t)}</Tag>
                      </span>
                    </Link>

                    <div className={styles.cardBody}>
                      <div className={styles.cardOverline}>
                        <span>{[seriesLabel(artwork.series), artwork.year].filter(Boolean).join(' · ') || 'JBU'}</span>
                      </div>
                      <Link href={`/artwork/${artwork.sku}`} className={styles.cardTitleLink}>
                        <h3 className={styles.cardTitle}>{L(artwork, 'title')}</h3>
                      </Link>
                      {hasPrintOption && <p className={styles.printIndicator}><Printer size={14} aria-hidden="true" />{t('Prints disponibles', 'Prints Available')}</p>}
                      {printsOnly && !available && <p className={styles.details}>{t('La obra original no está disponible', 'The original artwork is unavailable')}</p>}
                      <p className={styles.details}>{printsOnly ? t('Formatos y acabados a elegir', 'Choose a size and finish') : [L(artwork, 'medium'), artwork.dimensions, artwork.year].filter(Boolean).join(' · ')}</p>
                      {promotePrint && printInfo?.startingPriceMxn ? (
                        <p className={styles.cardPrice}>{t('Prints desde ', 'Prints from ')}{displayPrice(printInfo.startingPriceMxn).text}</p>
                      ) : !printsOnly && commerce.showPrice ? (
                        <p className={styles.cardPrice}>{displayPrice(commerce.price).text}</p>
                      ) : null}
                      <div className={styles.actions}>
                        {promotePrint && (
                          <Button as={Link} href={`/artwork/${artwork.sku}#prints`} kind="secondary" size="sm" renderIcon={Printer}>
                            {t('Ver opciones de print', 'View print options')}
                          </Button>
                        )}
                        {!printsOnly && !promotePrint && commerce.showAdd && (
                          <Button
                            kind="primary"
                            size="sm"
                            renderIcon={ShoppingCart}
                            disabled={addedSku === artwork.sku}
                            onClick={async () => {
                              const ok = await addToCart(artwork)
                              if (ok) {
                                setAddedSku(artwork.sku || null)
                                setTimeout(() => setAddedSku(null), 2500)
                              }
                            }}
                          >
                            {addedSku === artwork.sku ? t('Agregada', 'Added') : t('Agregar', 'Add')}
                          </Button>
                        )}
                        {!printsOnly && commerce.showInquiry && (
                          <AskForPriceButton artwork={artwork} settings={siteSettings} size="sm" kind="ghost" />
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
