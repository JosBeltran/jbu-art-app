
'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import {
  Button,
  Column,
  Grid,
  Modal,
  Search,
} from '@carbon/react'

import {
  ArrowRight,
  Filter,
} from '@carbon/icons-react'

import BuyButton from '@/components/BuyButton'

export default function CatalogClient({
  initialArtworks = [],
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSeries, setSelectedSeries] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false)

  // ==========================================================
  // IMAGEN
  // ==========================================================

  const getImageSrc = (url) => {
    if (!url) return '/placeholder.jpg'

    if (
      url.startsWith('http://') ||
      url.startsWith('https://')
    ) {
      return url
    }

    return url.startsWith('/')
      ? url
      : `/${url}`
  }

  // ==========================================================
  // COLECCIONES
  // ==========================================================

  const seriesList = useMemo(() => {
    const series = initialArtworks
      .map((art) => art.series)
      .filter(Boolean)

    return Array.from(new Set(series))
  }, [initialArtworks])

  // ==========================================================
  // FILTRADO
  // ==========================================================

  const filteredArtworks = useMemo(() => {
    const normalizedSearch = searchQuery
      .trim()
      .toLowerCase()

    return initialArtworks.filter((art) => {
      const matchesSearch =
        !normalizedSearch ||
        art.title?.toLowerCase().includes(normalizedSearch) ||
        art.medium?.toLowerCase().includes(normalizedSearch) ||
        art.series?.toLowerCase().includes(normalizedSearch)

      const matchesSeries =
        selectedSeries === 'ALL' ||
        art.series === selectedSeries

      const matchesStatus =
        statusFilter === 'ALL' ||
        (
          statusFilter === 'AVAILABLE' &&
          art.status === 'AVAILABLE'
        ) ||
        (
          statusFilter === 'SOLD' &&
          art.status === 'SOLD'
        )

      return (
        matchesSearch &&
        matchesSeries &&
        matchesStatus
      )
    })
  }, [
    initialArtworks,
    searchQuery,
    selectedSeries,
    statusFilter,
  ])

  // ==========================================================
  // FILTROS
  // ==========================================================

  const handleClearFilters = () => {
    setSearchQuery('')
    setSelectedSeries('ALL')
    setStatusFilter('ALL')
  }

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedSeries !== 'ALL' ||
    statusFilter !== 'ALL'

  const activeFilterCount =
    (searchQuery.trim() !== '' ? 1 : 0) +
    (selectedSeries !== 'ALL' ? 1 : 0) +
    (statusFilter !== 'ALL' ? 1 : 0)

  const selectedSeriesLabel =
    selectedSeries === 'ALL'
      ? 'Todas las obras'
      : selectedSeries

  // ==========================================================
  // FILTER CONTENT
  // ==========================================================

  const FilterContent = ({ mobile = false }) => (
    <div className="flex flex-col">

      {/* SEARCH */}

      <section className="border-b border-[var(--cds-border-subtle)] pb-7">
        <div className="mb-3">
          <span className="
            cds--type-label-01
            uppercase
            tracking-[0.16em]
            text-[var(--cds-text-secondary)]
          ">
            Buscar
          </span>
        </div>

        <Search
          id={mobile ? 'mobile-artwork-search' : 'artwork-search'}
          size="md"
          labelText="Buscar obras"
          placeholder="Título, técnica o serie"
          value={searchQuery}
          onChange={(event) =>
            setSearchQuery(event.target.value)
          }
          onClear={() => setSearchQuery('')}
          closeButtonLabelText="Limpiar búsqueda"
        />
      </section>

      {/* COLLECTION */}

      <section className="
        border-b
        border-[var(--cds-border-subtle)]
        py-7
      ">
        <div className="mb-4">
          <span className="
            cds--type-label-01
            uppercase
            tracking-[0.16em]
            text-[var(--cds-text-secondary)]
          ">
            Colección
          </span>
        </div>

        <nav
          aria-label="Filtrar por colección"
          className="flex flex-col"
        >

          <button
            type="button"
            onClick={() => setSelectedSeries('ALL')}
            className={`
              flex
              items-center
              justify-between
              border-b
              border-[var(--cds-border-subtle)]
              py-2.5
              text-left
              text-sm
              transition-colors
              ${
                selectedSeries === 'ALL'
                  ? 'text-[var(--cds-text-primary)]'
                  : 'text-[var(--cds-text-secondary)] hover:text-[var(--cds-text-primary)]'
              }
            `}
          >
            <span>Todas las obras</span>

            {selectedSeries === 'ALL' && (
              <ArrowRight size={16} />
            )}
          </button>

          {seriesList.map((series) => (
            <button
              key={series}
              type="button"
              onClick={() => setSelectedSeries(series)}
              className={`
                flex
                items-center
                justify-between
                border-b
                border-[var(--cds-border-subtle)]
                py-2.5
                text-left
                text-sm
                transition-colors
                ${
                  selectedSeries === series
                    ? 'text-[var(--cds-text-primary)]'
                    : 'text-[var(--cds-text-secondary)] hover:text-[var(--cds-text-primary)]'
                }
              `}
            >
              <span>{series}</span>

              {selectedSeries === series && (
                <ArrowRight size={16} />
              )}
            </button>
          ))}
        </nav>
      </section>

      {/* AVAILABILITY */}

      <section className="pt-7">

        <div className="mb-4">
          <span className="
            cds--type-label-01
            uppercase
            tracking-[0.16em]
            text-[var(--cds-text-secondary)]
          ">
            Disponibilidad
          </span>
        </div>

        <div className="flex flex-col">

          {[
            {
              value: 'ALL',
              label: 'Todos',
            },
            {
              value: 'AVAILABLE',
              label: 'Disponibles',
            },
            {
              value: 'SOLD',
              label: 'Colección privada',
            },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setStatusFilter(item.value)}
              className={`
                flex
                items-center
                justify-between
                border-b
                border-[var(--cds-border-subtle)]
                py-2.5
                text-left
                text-sm
                transition-colors
                ${
                  statusFilter === item.value
                    ? 'text-[var(--cds-text-primary)]'
                    : 'text-[var(--cds-text-secondary)] hover:text-[var(--cds-text-primary)]'
                }
              `}
            >
              <span>{item.label}</span>

              {statusFilter === item.value && (
                <ArrowRight size={16} />
              )}
            </button>
          ))}

        </div>
      </section>

      {/* CLEAR */}

      {hasActiveFilters && (
        <div className="pt-7">

          <Button
            kind="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="!p-0"
          >
            Limpiar filtros
          </Button>

        </div>
      )}

      {/* MOBILE APPLY */}

      {mobile && (
        <div className="
          mt-8
          border-t
          border-[var(--cds-border-subtle)]
          pt-5
        ">
          <Button
            kind="primary"
            className="w-full"
            onClick={() => setIsFilterPanelOpen(false)}
          >
            Ver {filteredArtworks.length}{' '}
            {filteredArtworks.length === 1
              ? 'obra'
              : 'obras'}
          </Button>
        </div>
      )}

    </div>
  )

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <>
      {/* ======================================================
          MOBILE FILTER PANEL
          ====================================================== */}
<Modal
  open={isFilterPanelOpen}
  onRequestClose={() => setIsFilterPanelOpen(false)}
  modalHeading="Explorar obras"
  modalLabel="Filtros"
  primaryButtonText={`Ver ${filteredArtworks.length} ${
    filteredArtworks.length === 1 ? 'obra' : 'obras'
  }`}
  secondaryButtonText="Cancelar"
  onRequestSubmit={() => setIsFilterPanelOpen(false)}
  onSecondarySubmit={() => setIsFilterPanelOpen(false)}
>
  <FilterContent mobile />
</Modal>

      <Grid className="cds--grid--full-width">

        {/* ====================================================
            DESKTOP FILTERS
            ==================================================== */}

        <Column
          sm={16}
          md={5}
          lg={4}
          className="hidden md:block"
        >
          <aside
            aria-label="Filtros del catálogo"
            className="
              sticky
              top-24
              pr-8
            "
          >

            <div className="
              mb-7
              flex
              items-center
              justify-between
              border-b
              border-[var(--cds-border-subtle)]
              pb-4
            ">
              <span className="
                cds--type-label-01
                uppercase
                tracking-[0.16em]
                text-[var(--cds-text-secondary)]
              ">
                Explorar
              </span>

              {activeFilterCount > 0 && (
                <span className="
                  cds--type-label-01
                  text-[var(--cds-text-secondary)]
                ">
                  {activeFilterCount}
                </span>
              )}
            </div>

            <FilterContent />

          </aside>
        </Column>

        {/* ====================================================
            CONTENT
            ==================================================== */}

        <Column
          sm={16}
          md={11}
          lg={12}
        >

          {/* MOBILE FILTER BUTTON */}

          <div className="
            mb-8
            flex
            items-center
            justify-between
            border-b
            border-[var(--cds-border-subtle)]
            pb-4
            md:hidden
          ">

            <span className="
              cds--type-label-01
              uppercase
              tracking-[0.16em]
              text-[var(--cds-text-secondary)]
            ">
              Obras
            </span>

            <Button
              kind="ghost"
              size="sm"
              renderIcon={Filter}
              onClick={() => setIsFilterPanelOpen(true)}
            >
              Filtros
              {activeFilterCount > 0 &&
                ` (${activeFilterCount})`}
            </Button>

          </div>

          {/* ==================================================
              HEADER
              ================================================== */}

          <header className="
            mb-10
            border-b
            border-[var(--cds-border-subtle)]
            pb-5
          ">

            <div className="
              flex
              flex-col
              gap-3
              sm:flex-row
              sm:items-end
              sm:justify-between
            ">

              <div>

                <span className="
                  cds--type-label-01
                  mb-2
                  block
                  uppercase
                  tracking-[0.16em]
                  text-[var(--cds-text-secondary)]
                ">
                  Works
                </span>

                <h2 className="
                  cds--type-productive-heading-04
                  text-[var(--cds-text-primary)]
                ">
                  {selectedSeriesLabel}
                </h2>

              </div>

              <span className="
                cds--type-label-01
                whitespace-nowrap
                text-[var(--cds-text-secondary)]
              ">
                {filteredArtworks.length}{' '}
                {filteredArtworks.length === 1
                  ? 'obra'
                  : 'obras'}
              </span>

            </div>
          </header>

          {/* ==================================================
              NO RESULTS
              ================================================== */}

          {filteredArtworks.length === 0 ? (

            <div className="
              border-y
              border-[var(--cds-border-subtle)]
              py-20
              text-center
            ">

              <h3 className="
                cds--type-productive-heading-03
                mb-3
                text-[var(--cds-text-primary)]
              ">
                No encontramos obras
              </h3>

              <p className="
                cds--type-body-01
                mb-6
                text-[var(--cds-text-secondary)]
              ">
                Intenta cambiar los filtros o realizar
                otra búsqueda.
              </p>

              <Button
                kind="tertiary"
                onClick={handleClearFilters}
              >
                Ver todas las obras
              </Button>

            </div>

          ) : (

            /* ==================================================
               ARTWORK GRID
               ================================================== */

            <Grid className="cds--grid--full-width">

              {filteredArtworks.map((art) => {

                const imgSrc = getImageSrc(
                  art.primary_image_url ||
                  art.image_url ||
                  art.image
                )

                const isAvailable =
                  art.status === 'AVAILABLE'

                return (

                  <Column
                    key={art.id}
                    sm={16}
                    md={8}
                    lg={6}
                    xlg={6}
                    className="mb-16"
                  >

                    <article className="group">

                      {/* ======================================
                          IMAGE
                          ====================================== */}

                      <Link
                        href={`/artwork/${art.sku}`}
                        className="
                          block
                          focus:outline-none
                          focus-visible:ring-2
                          focus-visible:ring-[var(--cds-focus)]
                        "
                      >

                        <div className="
                          relative
                          aspect-[4/5]
                          w-full
                          overflow-hidden
                          bg-[var(--cds-layer-01)]
                        ">

                          <img
                            src={imgSrc}
                            alt={
                              art.title ||
                              'Obra de arte'
                            }
                            className="
                              absolute
                              inset-0
                              h-full
                              w-full
                              object-cover
                              transition-transform
                              duration-[1200ms]
                              ease-[cubic-bezier(0.16,1,0.3,1)]
                              group-hover:scale-[1.035]
                            "
                          />

                          {/* STATUS */}

                          <div className="
                            absolute
                            left-4
                            top-4
                            z-10
                          ">

                            <span className="
                              inline-flex
                              items-center
                              gap-2
                              bg-black/65
                              px-2
                              py-1
                              text-[9px]
                              font-mono
                              uppercase
                              tracking-[0.16em]
                              text-white
                              backdrop-blur-sm
                            ">

                              <span
                                className={`
                                  h-1.5
                                  w-1.5
                                  rounded-full
                                  ${
                                    isAvailable
                                      ? 'bg-[#42be65]'
                                      : 'bg-[#f1c21b]'
                                  }
                                `}
                              />

                              {isAvailable
                                ? 'Disponible'
                                : 'Colección privada'}

                            </span>

                          </div>

                          {/* HOVER */}

                          <div className="
                            pointer-events-none
                            absolute
                            inset-0
                            flex
                            items-end
                            justify-end
                            bg-black/0
                            p-5
                            opacity-0
                            transition-all
                            duration-500
                            group-hover:bg-black/20
                            group-hover:opacity-100
                          ">

                            <span className="
                              inline-flex
                              items-center
                              gap-2
                              bg-white
                              px-3
                              py-2
                              text-[10px]
                              font-mono
                              uppercase
                              tracking-[0.16em]
                              text-black
                            ">
                              Ver obra
                              <ArrowRight size={12} />
                            </span>

                          </div>

                        </div>

                      </Link>

                      {/* ======================================
                          METADATA
                          ====================================== */}

                      <div className="pt-4">

                        <div className="
                          mb-2
                          flex
                          items-center
                          justify-between
                          gap-4
                        ">

                          <span className="
                            text-[9px]
                            font-mono
                            uppercase
                            tracking-[0.18em]
                            text-[var(--cds-text-secondary)]
                          ">
                            {art.sku ||
                              art.series ||
                              'JBU-STUDIO'}
                          </span>

                          <span className="
                            whitespace-nowrap
                            text-[11px]
                            font-mono
                            text-[var(--cds-text-secondary)]
                          ">
                            {art.calculated_price_mxn
                              ? `$${art.calculated_price_mxn.toLocaleString()} MXN`
                              : 'Consultar'}
                          </span>

                        </div>

                        <Link
                          href={`/artwork/${art.sku}`}
                          className="
                            block
                            focus:outline-none
                            focus-visible:ring-2
                            focus-visible:ring-[var(--cds-focus)]
                          "
                        >

                          <h3 className="
                            text-[17px]
                            font-light
                            leading-tight
                            tracking-[-0.01em]
                            text-[var(--cds-text-primary)]
                            transition-opacity
                            duration-300
                            group-hover:opacity-70
                          ">
                            {art.title}
                          </h3>

                        </Link>

                        <p className="
                          mt-2
                          text-[11px]
                          font-light
                          tracking-wide
                          text-[var(--cds-text-secondary)]
                        ">
                          {art.medium}

                          {art.dimensions && (
                            <>
                              <span className="
                                mx-2
                                text-[var(--cds-border-strong)]
                              ">
                                ·
                              </span>

                              {art.dimensions}
                            </>
                          )}
                        </p>

                        {/* ACTIONS */}

                        <div className="
                          mt-5
                          flex
                          items-center
                          justify-between
                          border-t
                          border-[var(--cds-border-subtle)]
                          pt-3
                        ">

                          <Link
                            href={`/artwork/${art.sku}`}
                            className="
                              inline-flex
                              items-center
                              gap-2
                              text-[10px]
                              font-mono
                              uppercase
                              tracking-[0.16em]
                              text-[var(--cds-text-secondary)]
                              transition-colors
                              duration-300
                              hover:text-[var(--cds-text-primary)]
                            "
                          >
                            Detalles
                            <ArrowRight size={12} />
                          </Link>

                          {isAvailable && (
                            <div>
                              {art.stripe_url ? (
                                <Button
                                  as="a"
                                  href={art.stripe_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  size="sm"
                                  kind="primary"
                                >
                                  Adquirir
                                </Button>
                              ) : (
                                <BuyButton
                                  artwork={art}
                                />
                              )}
                            </div>
                          )}

                        </div>

                      </div>

                    </article>

                  </Column>

                )
              })}

            </Grid>

          )}

        </Column>

      </Grid>
    </>
  )
}

