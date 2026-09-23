'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Button,
  ContentSwitcher,
  Dropdown,
  Modal,
  Search,
  Switch,
  Tag,
} from '@carbon/react'
import { ArrowRight, Filter, Reset } from '@carbon/icons-react'
import ArtworkImage from '@/components/ArtworkImage'
import BuyButton from '@/components/BuyButton'
import styles from './Catalog.module.css'
import { useI18n, useLocalized } from '@/components/I18nProvider'

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
  primary_image_url?: string
  image_url?: string
  image?: string
  calculated_price_mxn?: number
  base_price_mxn?: number
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
  return String(artwork.ownership_status || artwork.status || '').toUpperCase()
}

function artworkPrice(artwork: Artwork) {
  return Number(artwork.calculated_price_mxn ?? artwork.base_price_mxn ?? 0)
}

export default function CatalogClient({ initialArtworks = [] }: { initialArtworks?: Artwork[] }) {
  const { t, locale } = useI18n()
  const L = useLocalized()
  const STATUS_OPTIONS = useMemo(() => getStatusOptions(t), [t])
  const SORT_OPTIONS = useMemo(() => getSortOptions(t), [t])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSeries, setSelectedSeries] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [sortOrder, setSortOrder] = useState('RECENT')
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false)

  const seriesOptions = useMemo<Option[]>(() => {
    const values = Array.from(new Set(initialArtworks.map((artwork) => artwork.series).filter((value): value is string => Boolean(value))))
    return [{ id: 'ALL', text: t('Todas las series', 'All series') }, ...values.map((value) => ({ id: value, text: value }))]
  }, [initialArtworks, t])

  const filteredArtworks = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase(locale)
    const matches = initialArtworks.filter((artwork) => {
      const haystack = [L(artwork, 'title'), L(artwork, 'medium'), artwork.series, artwork.sku].filter(Boolean).join(' ').toLocaleLowerCase(locale)
      const status = artworkStatus(artwork)
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'AVAILABLE' ? status === 'AVAILABLE' : status !== 'AVAILABLE')
      return (!query || haystack.includes(query)) && (selectedSeries === 'ALL' || artwork.series === selectedSeries) && matchesStatus
    })

    return [...matches].sort((a, b) => {
      if (sortOrder === 'PRICE_ASC') return artworkPrice(a) - artworkPrice(b)
      if (sortOrder === 'PRICE_DESC') return artworkPrice(b) - artworkPrice(a)
      if (sortOrder === 'TITLE') return String(L(a, 'title') || '').localeCompare(String(L(b, 'title') || ''), locale)
      return String(b.created_at || '').localeCompare(String(a.created_at || ''))
    })
  }, [initialArtworks, searchQuery, selectedSeries, statusFilter, sortOrder, L, locale])

  const hasActiveFilters = Boolean(searchQuery.trim() || selectedSeries !== 'ALL' || statusFilter !== 'ALL')
  const activeFilterCount = Number(Boolean(searchQuery.trim())) + Number(selectedSeries !== 'ALL') + Number(statusFilter !== 'ALL')
  const selectedSeriesOption = seriesOptions.find((option) => option.id === selectedSeries) || seriesOptions[0]
  const selectedSortOption = SORT_OPTIONS.find((option) => option.id === sortOrder) || SORT_OPTIONS[0]

  function clearFilters() {
    setSearchQuery('')
    setSelectedSeries('ALL')
    setStatusFilter('ALL')
  }

  const filters = (mobile = false) => (
    <div>
      <section className={styles.filterSection}>
        <span className={styles.filterLabel}>{t('Buscar', 'Search')}</span>
        <Search
          id={mobile ? 'mobile-artwork-search' : 'artwork-search'}
          size="md"
          labelText={t('Buscar obras', 'Search artworks')}
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
          onChange={({ selectedItem }) => setSelectedSeries(selectedItem?.id || 'ALL')}
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
        primaryButtonText={`${t('Ver', 'View')} ${filteredArtworks.length} ${t('obras', 'artworks')}`}
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
          <span className={styles.filterLabel}>{t('Explorar catálogo', 'Explore catalog')}</span>
          {filters()}
        </aside>

        <section className={styles.results} aria-live="polite">
          <header className={styles.resultHeader}>
            <div>
              <p className={styles.kicker}>{t('Obras', 'Artworks')}</p>
              <h2 className={styles.resultTitle}>{selectedSeriesOption?.text}</h2>
            </div>
            <div className={styles.desktopOnly}>
              <Dropdown
                id="catalog-sort"
                titleText={t('Ordenar', 'Sort')}
                label={t('Ordenar obras', 'Sort artworks')}
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
              <h3>{t('No encontramos obras', 'No artworks found')}</h3>
              <p>{t('Prueba otra búsqueda o limpia los filtros.', 'Try another search or clear the filters.')}</p>
              <Button kind="tertiary" onClick={clearFilters}>{t('Ver todas las obras', 'View all artworks')}</Button>
            </div>
          ) : (
            <div className={styles.grid}>
              {filteredArtworks.map((artwork) => {
                const available = artworkStatus(artwork) === 'AVAILABLE'
                const price = artworkPrice(artwork)
                return (
                  <article key={artwork.id} className={styles.card}>
                    <Link href={`/artwork/${artwork.sku}`} className={styles.imageLink}>
                      <ArtworkImage
                        title={L(artwork, 'title')}
                        primaryUrl={artwork.primary_image_url || artwork.image_url || artwork.image}
                        sku={artwork.sku}
                        className={styles.image}
                      />
                      <span className={styles.tag}>
                        <Tag type={available ? 'green' : 'gray'} size="sm">{available ? t('Disponible', 'Available') : t('Colección privada', 'Private collection')}</Tag>
                      </span>
                      <span className={styles.viewLabel}>{t('Ver obra', 'View artwork')} <ArrowRight size={14} aria-hidden /></span>
                    </Link>

                    <div className={styles.cardBody}>
                      <div className={styles.cardOverline}>
                        <span>{artwork.sku || artwork.series || 'JBU'}</span>
                        <span className={styles.price}>{price ? `$${price.toLocaleString(locale)} MXN` : t('Consultar', 'Inquire')}</span>
                      </div>
                      <Link href={`/artwork/${artwork.sku}`} className={styles.cardTitleLink}>
                        <h3 className={styles.cardTitle}>{L(artwork, 'title')}</h3>
                      </Link>
                      <p className={styles.details}>{[L(artwork, 'medium'), artwork.dimensions, artwork.year].filter(Boolean).join(' · ')}</p>
                      <div className={styles.actions}>
                        <Button as={Link} href={`/artwork/${artwork.sku}`} kind="ghost" size="sm" renderIcon={ArrowRight}>{t('Detalles', 'Details')}</Button>
                        {available && (artwork.stripe_url ? (
                          <Button as="a" href={artwork.stripe_url} target="_blank" rel="noreferrer" size="sm">{t('Adquirir', 'Acquire')}</Button>
                        ) : (
                          <BuyButton artworkId={artwork.id} price={price} status={artworkStatus(artwork)} compact />
                        ))}
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
