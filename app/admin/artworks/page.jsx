'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Button,
  Tag,
  InlineNotification,
  Pagination,
  DataTableSkeleton,
} from '@carbon/react'
import { Add, Launch, Edit } from '@carbon/icons-react'
import styles from './ArtworksList.module.css'
import { useI18n } from '@/components/I18nProvider'

const PAGE_SIZE = 15

export default function AdminArtworksPage() {
  const router = useRouter()
  const { t } = useI18n()

  const [loading, setLoading] = useState(true)
  const [artworks, setArtworks] = useState([])
  const [errorMsg, setErrorMsg] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const verifyAdminAndFetchArtworks = async () => {
      setLoading(true)

      const { data: artworksData, error: artworksError } = await supabase
        .from('artworks')
        .select('*')
        .order('created_at', { ascending: false })

      if (artworksError) {
        setErrorMsg(t('Error al cargar inventario: ', 'Error loading inventory: ') + artworksError.message)
        setLoading(false)
        return
      }

      const ownerIds = (artworksData || [])
        .map((a) => a.current_owner_id)
        .filter(Boolean)

      let profilesMap = {}

      if (ownerIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', ownerIds)

        if (profilesData) {
          profilesMap = profilesData.reduce((acc, p) => {
            acc[p.id] = p
            return acc
          }, {})
        }
      }

      const formattedArtworks = (artworksData || []).map((art) => ({
        ...art,
        id: art.id.toString(), // DataTable de Carbon requiere que el id sea string
        current_owner: art.current_owner_id ? profilesMap[art.current_owner_id] : null,
      }))

      setArtworks(formattedArtworks)
      setLoading(false)
    }

    verifyAdminAndFetchArtworks()
  }, [router])

  // Cabeceras oficiales requeridas por DataTable de Carbon
  const headers = [
    { key: 'title', header: t('Obra / SKU', 'Artwork / SKU') },
    { key: 'series', header: t('Serie / Año', 'Series / Year') },
    { key: 'base_price_mxn', header: t('Precio Base', 'Base Price') },
    { key: 'ownership_status', header: t('Estado', 'Status') },
    { key: 'current_owner', header: t('Propietario / Token', 'Owner / Token') },
    { key: 'actions', header: t('Acciones', 'Actions') },
  ]

  const totalPages = Math.max(1, Math.ceil(artworks.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = artworks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  if (loading) {
    return (
      <div className={styles.shell}>
        <div className={styles.inner}>
          <DataTableSkeleton
            columnCount={headers.length}
            rowCount={6}
            showHeader
            showToolbar
            headers={headers}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.shell}>
      <div className={styles.inner}>

        {/* ENCABEZADO */}
        <div className={styles.header}>
          <div>
            <span className={styles.kicker}>{t('Panel Administrativo — Estudio JBU', 'Admin Panel — Estudio JBU')}</span>
            <h1 className={styles.title}>{t('Inventario de Obras', 'Artwork Inventory')}</h1>
          </div>

          <div className={styles.headerActions}>
            <Tag type="purple" size="md">
              {artworks.length} {artworks.length === 1 ? t('Pieza', 'Piece') : t('Piezas', 'Pieces')}
            </Tag>

            <Button
              as={Link}
              href="/admin/artworks/new"
              renderIcon={Add}
              size="md"
            >
              {t('Registrar Nueva Obra', 'Register New Artwork')}
            </Button>
          </div>
        </div>

        {/* MENSAJE DE ERROR */}
        {errorMsg && (
          <InlineNotification
            kind="error"
            title={t('Error de sistema', 'System error')}
            subtitle={errorMsg}
            lowContrast
            hideCloseButton
          />
        )}

        {/* DATATABLE OFICIAL DE CARBON */}
        <DataTable rows={pagedRows} headers={headers} isSortable>
          {({
            rows,
            headers,
            getHeaderProps,
            getRowProps,
            onInputChange,
          }) => (
            <TableContainer className={styles.tableContainer}>
              <TableToolbar>
                <TableToolbarContent>
                  <TableToolbarSearch
                    onChange={onInputChange}
                    placeholder={t('Filtrar obras...', 'Filter artworks...')}
                    persistent
                    size="sm"
                  />
                </TableToolbarContent>
              </TableToolbar>

              <Table size="lg" useZebraStyles>
                <TableHead>
                  <TableRow>
                    {headers.map((header) => {
                      // La key va directa en el JSX, nunca dentro del spread
                      const { key: headerKey, ...headerProps } = getHeaderProps({ header })
                      return (
                        <TableHeader key={headerKey || header.key} {...headerProps}>
                          {header.header}
                        </TableHeader>
                      )
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={headers.length}>
                        <div className={styles.empty}>
                          {t('No hay obras registradas o que coincidan con la búsqueda.', 'No registered artworks match the search.')}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => {
                      const art = artworks.find((a) => a.id === row.id)
                      if (!art) return null

                      const statusType =
                        art.ownership_status === 'CLAIMED' ? 'green' :
                        art.ownership_status === 'RESERVED' ? 'magenta' : 'cool-gray'

                      // La key de la fila va directa en el JSX, nunca dentro del spread
                      const { key: rowKey, ...rowProps } = getRowProps({ row })

                      return (
                        <TableRow key={rowKey || row.id} {...rowProps}>

                          {/* Obra / SKU */}
                          <TableCell>
                            <div className={styles.artworkCell}>
                              <div className={styles.thumb}>
                                {art.primary_image_url ? (
                                  <img
                                    src={
                                      art.primary_image_url.startsWith('http://') ||
                                      art.primary_image_url.startsWith('https://') ||
                                      art.primary_image_url.startsWith('/')
                                        ? art.primary_image_url
                                        : `/${art.primary_image_url}`
                                    }
                                    alt={art.title || 'Obra'}
                                    className={styles.thumbImage}
                                  />
                                ) : (
                                  <div className={styles.thumbEmpty}>S/I</div>
                                )}
                              </div>
                              <div className={styles.artworkMeta}>
                                <p className={styles.artworkTitle}>{art.title}</p>
                                <span className={styles.sku}>{art.sku?.toUpperCase()}</span>
                              </div>
                            </div>
                          </TableCell>

                          {/* Serie / Año */}
                          <TableCell>
                            <p className={styles.series}>{art.series}</p>
                            <p className={styles.year}>{art.year}</p>
                          </TableCell>

                          {/* Precio Base */}
                          <TableCell className={styles.price}>
                            {art.base_price_mxn ? `$${Number(art.base_price_mxn).toLocaleString()} MXN` : t('N/D', 'N/A')}
                          </TableCell>

                          {/* Estado */}
                          <TableCell>
                            <Tag type={statusType} size="sm">
                              {art.ownership_status || 'AVAILABLE'}
                            </Tag>
                          </TableCell>

                          {/* Propietario / Token */}
                          <TableCell>
                            {art.current_owner ? (
                              <div>
                                <p className={styles.ownerName}>
                                  {art.current_owner.full_name || t('Coleccionista', 'Collector')}
                                </p>
                                <p className={styles.ownerEmail}>{art.current_owner.email}</p>
                              </div>
                            ) : (
                              <div className={styles.token}>
                                <span className={styles.tokenLabel}>{t('Token: ', 'Token: ')}</span>
                                <span className={styles.tokenValue}>{art.claim_token || t('N/D', 'N/A')}</span>
                              </div>
                            )}
                          </TableCell>

                          {/* Acciones */}
                          <TableCell>
                            <div className={styles.rowActions}>
                              <Button
                                as={Link}
                                href={`/admin/artworks/${row.id}/edit`}
                                kind="ghost"
                                size="sm"
                                renderIcon={Edit}
                                hasIconOnly
                                iconDescription={t('Editar obra', 'Edit artwork')}
                              />
                              <Button
                                as={Link}
                                href={`/verify/${encodeURIComponent(art.sku)}`}
                                kind="tertiary"
                                size="sm"
                                renderIcon={Launch}
                                hasIconOnly
                                iconDescription={t('Ver certificado', 'View certificate')}
                              />
                            </div>
                          </TableCell>

                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>

        {artworks.length > PAGE_SIZE && (
          <Pagination
            page={currentPage}
            pageSize={PAGE_SIZE}
            pageSizes={[PAGE_SIZE]}
            totalItems={artworks.length}
            onChange={({ page: nextPage }) => setPage(nextPage)}
            pagesUnknown={false}
            backwardText={t('Página anterior', 'Previous page')}
            forwardText={t('Página siguiente', 'Next page')}
            itemsPerPageText={t('Obras por página', 'Artworks per page')}
            pageNumberText={t('Página', 'Page')}
          />
        )}

      </div>
    </div>
  )
}
