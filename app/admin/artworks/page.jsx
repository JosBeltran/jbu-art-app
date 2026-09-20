'use client'

import { useState, useEffect, useMemo } from 'react'
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
  Pagination
} from '@carbon/react'
import { Add, Launch, Edit } from '@carbon/icons-react'

export default function AdminArtworksPage() {
  const router = useRouter()
  
  const [loading, setLoading] = useState(true)
  const [artworks, setArtworks] = useState([])
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const verifyAdminAndFetchArtworks = async () => {
      setLoading(true)

      const { data: artworksData, error: artworksError } = await supabase
        .from('artworks')
        .select('*')
        .order('created_at', { ascending: false })

      if (artworksError) {
        setErrorMsg('Error al cargar inventario: ' + artworksError.message)
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
    { key: 'title', header: 'Obra / SKU' },
    { key: 'series', header: 'Serie / Año' },
    { key: 'base_price_mxn', header: 'Precio Base' },
    { key: 'ownership_status', header: 'Estado' },
    { key: 'current_owner', header: 'Propietario / Token' },
    { key: 'actions', header: 'Acciones' },
  ]

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--cds-background)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)' }}>
          Cargando inventario de obras...
        </p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--cds-background)', color: 'var(--cds-text-primary)', padding: '2.5rem 1.5rem' }}>
      {/* Contenedor centralizado principal */}
      <div style={{ maxWidth: '84rem', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

        {/* ENCABEZADO */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'row', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          borderBottom: '1px solid var(--cds-border-subtle01)', 
          paddingBottom: '1.5rem', 
          flexWrap: 'wrap',
          gap: '1rem' 
        }}>
          <div>
            <span className="cds--label" style={{ color: 'var(--cds-support-warning)', marginBottom: '0.25rem', display: 'block' }}>
              Panel Administrativo — Estudio JBU
            </span>
            <h1 style={{ fontSize: '2rem', fontWeight: '300', margin: 0, letterSpacing: '-0.5px' }}>
              Inventario de Obras
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Tag type="purple" size="md" style={{ fontFamily: 'monospace', margin: 0 }}>
              {artworks.length} {artworks.length === 1 ? 'Pieza' : 'Piezas'}
            </Tag>

            <Button
              as={Link}
              href="/admin/artworks/new"
              renderIcon={Add}
              size="md"
            >
              Registrar Nueva Obra
            </Button>
          </div>
        </div>

        {/* MENSAJE DE ERROR */}
        {errorMsg && (
          <InlineNotification
            kind="error"
            title="Error de sistema"
            subtitle={errorMsg}
            lowContrast
          />
        )}

        {/* DATATABLE OFICIAL DE CARBON */}
        <DataTable rows={artworks} headers={headers} isSortable>
          {({
            rows,
            headers,
            getHeaderProps,
            getRowProps,
            getSelectionProps,
            getBatchActionProps,
            onInputChange,
            selectedRows,
            toolbar,
          }) => (
            <TableContainer 
              title="" 
              description=""
              style={{ backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle01)' }}
            >
              <TableToolbar style={{ backgroundColor: 'var(--cds-layer-01)' }}>
                <TableToolbarContent>
                  <TableToolbarSearch 
                    onChange={onInputChange} 
                    placeholder="Filtrar obras..." 
                    persistent 
                    size="sm"
                  />
                </TableToolbarContent>
              </TableToolbar>

              <Table size="lg" useZebraStyles={false}>
                <TableHead>
                  <TableRow>
    {headers.map((header) => {
      // Extraemos la key del objeto para pasarla de forma independiente
      const { key, ...headerProps } = getHeaderProps({ header })
      return (
        <TableHeader key={key || header.key} {...headerProps}>
          {header.header}
        </TableHeader>
      )
    })}
  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={headers.length} style={{ textAlign: 'center', padding: '3rem', color: 'var(--cds-text-secondary)' }}>
                        No hay obras registradas o que coincidan con la búsqueda.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => {
                      const art = artworks.find((a) => a.id === row.id)
                      if (!art) return null

                      const statusType = 
                        art.ownership_status === 'CLAIMED' ? 'green' : 
                        art.ownership_status === 'RESERVED' ? 'magenta' : 'cool-gray'

                      return (
                        <TableRow key={row.id} {...getRowProps({ row })}>
                          
                          {/* Obra / SKU */}
                          <TableCell>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                              <div style={{ width: '3rem', height: '3rem', backgroundColor: 'var(--cds-layer-02)', border: '1px solid var(--cds-border-subtle01)', borderRadius: '4px', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
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
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                ) : (
                                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'var(--cds-text-secondary)' }}>
                                    S/I
                                  </div>
                                )}
                              </div>
                              <div>
                                <p style={{ fontFamily: 'sans-serif', fontWeight: '600', fontSize: '0.875rem', color: 'var(--cds-text-primary)', margin: 0 }}>
                                  {art.title}
                                </p>
                                <span style={{ fontSize: '0.625rem', color: 'var(--cds-support-warning)', fontWeight: 'bold', textTransform: 'uppercase', fontFamily: 'monospace' }}>
                                  {art.sku?.toUpperCase()}
                                </span>
                              </div>
                            </div>
                          </TableCell>

                          {/* Serie / Año */}
                          <TableCell>
                            <p style={{ margin: 0, color: 'var(--cds-text-primary)', fontFamily: 'monospace' }}>{art.series}</p>
                            <p style={{ fontSize: '0.625rem', margin: 0, color: 'var(--cds-text-secondary)', fontFamily: 'monospace' }}>{art.year}</p>
                          </TableCell>

                          {/* Precio Base */}
                          <TableCell style={{ fontFamily: 'monospace' }}>
                            {art.base_price_mxn ? `$${Number(art.base_price_mxn).toLocaleString()} MXN` : 'N/A'}
                          </TableCell>

                          {/* Estado */}
                          <TableCell>
                            <Tag type={statusType} size="sm" style={{ margin: 0 }}>
                              {art.ownership_status || 'AVAILABLE'}
                            </Tag>
                          </TableCell>

                          {/* Propietario / Token */}
                          <TableCell>
                            {art.current_owner ? (
                              <div>
                                <p style={{ fontFamily: 'sans-serif', fontSize: '0.75rem', color: 'var(--cds-text-primary)', margin: 0 }}>
                                  {art.current_owner.full_name || 'Coleccionista'}
                                </p>
                                <p style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)', margin: 0, fontFamily: 'monospace' }}>
                                  {art.current_owner.email}
                                </p>
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                <span style={{ color: 'var(--cds-text-secondary)' }}>Token: </span>
                                <span style={{ color: 'var(--cds-support-warning)', fontWeight: 'bold', userSelect: 'all' }}>
                                  {art.claim_token || 'N/A'}
                                </span>
                              </div>
                            )}
                          </TableCell>

                          {/* Acciones */}
                          <TableCell style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <Button
                                as={Link}
                                href={`/admin/artworks/${row.id}/edit`}
                                kind="ghost"
                                size="sm"
                                renderIcon={Edit}
                                hasIconOnly
                                iconDescription="Editar obra"
                              />
                              <Button
                                as={Link}
                                href={`/verify/${encodeURIComponent(art.sku)}`}
                                kind="tertiary"
                                size="sm"
                                renderIcon={Launch}
                                hasIconOnly
                                iconDescription="Ver certificado"
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

      </div>
    </div>
  )
}