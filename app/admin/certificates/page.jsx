'use client'

import { useState, useEffect } from 'react'
import { 
  Tile, 
  Button, 
  InlineLoading, 
  DataTable,
  Table,
  TableHead,
  TableContainer,
  TableRow,
  TableHeader,
  TableBody,
  TableCell 
} from '@carbon/react'
import { Renew, Checkmark, Warning, Launch, Pen } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'

export default function AdminCertificatesPage() {
  const { t } = useI18n()
  const [artworks, setArtworks] = useState([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)
  const [message, setMessage] = useState(null)

  // Cargar obras en estado de reclamo pendiente o vendidas sin certificado
  const fetchPendingClaims = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/pending-claims')
      const data = await res.json()
      if (res.ok) {
        setArtworks(data.artworks || [])
      } else {
        setMessage({ type: 'error', text: data.error || t('Error al cargar las solicitudes', 'Error loading requests') })
      }
    } catch (err) {
      setMessage({ type: 'error', text: t('Error de red al consultar solicitudes', 'Network error querying requests') })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPendingClaims()
  }, [])

  // Aprobar la solicitud y generar/emitir el certificado
  const handleApprove = async (artworkId, userId) => {
    if (!userId) {
      setMessage({ type: 'error', text: t('No se identificó el usuario comprador/solicitante.', 'Could not identify the buyer/requesting user.') })
      return
    }

    setProcessingId(artworkId)
    setMessage(null)

    try {
      const res = await fetch('/api/artworks/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artworkId, userId })
      })

      const data = await res.json()

      if (res.ok) {
        setMessage({ 
          type: 'success', 
          text: t(
            `Certificado emitido exitosamente. Hash: ${data.certificateHash ? data.certificateHash.substring(0, 16) : 'N/A'}...`,
            `Certificate issued successfully. Hash: ${data.certificateHash ? data.certificateHash.substring(0, 16) : 'N/A'}...`
          ) 
        })
        fetchPendingClaims()
      } else {
        setMessage({ type: 'error', text: data.error || data.message || t('No se pudo emitir el certificado', 'Could not issue the certificate') })
      }
    } catch (err) {
      setMessage({ type: 'error', text: t('Error de conexión con el servidor', 'Server connection error') })
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--cds-background)',
      color: 'var(--cds-text-primary)',
      padding: '2.5rem 1.5rem',
      boxSizing: 'border-box'
    }}>
      <div style={{ maxWidth: '72rem', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* ENCABEZADO ADMIN */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--cds-border-subtle)', paddingBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f1c21b', display: 'inline-block' }}></span>
              <span style={{ fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#f1c21b' }}>
                {t('Estudio JBU — Control de Autenticidad', 'Estudio JBU — Authenticity Control')}
              </span>
            </div>
            <h1 style={{ fontSize: '1.75rem', fontFamily: 'serif', fontWeight: 300, color: 'var(--cds-text-primary)', margin: 0 }}>
              {t('Aprobación de Certificados Digitales', 'Digital Certificate Approval')}
            </h1>
          </div>

          <Button
            onClick={fetchPendingClaims}
            kind="secondary"
            size="sm"
            renderIcon={Renew}
          >
            {t('Actualizar Lista', 'Refresh List')}
          </Button>
        </header>

        {/* ALERTAS / MENSAJES */}
        {message && (
          <Tile style={{ 
            padding: '1rem', 
            backgroundColor: message.type === 'success' ? 'rgba(36, 161, 72, 0.05)' : 'rgba(da, 30, 39, 0.05)', 
            border: `1px solid ${message.type === 'success' ? 'rgba(36, 161, 72, 0.3)' : 'rgba(da, 30, 39, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            {message.type === 'success' ? (
              <Checkmark style={{ fill: '#42be65', flexShrink: 0 }} />
            ) : (
              <Warning style={{ fill: '#da1e28', flexShrink: 0 }} />
            )}
            <span style={{ fontSize: '0.8rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: message.type === 'success' ? '#42be65' : '#da1e28' }}>
              {message.text}
            </span>
          </Tile>
        )}

        {/* TABLA DE SOLICITUDES */}
        <Tile style={{ padding: 0, backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}>
              <InlineLoading description={t('Cargando solicitudes de registro...', 'Loading registration requests...')} />
            </div>
          ) : artworks.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.8rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)', margin: 0 }}>
                {t('No hay solicitudes de certificados pendientes por autorizar.', 'There are no pending certificate requests to authorize.')}
              </p>
              <p style={{ fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-helper)', margin: 0 }}>
                {t('Las obras adquiridas o solicitadas aparecerán aquí para la generación del Hash SHA-256.', 'Acquired or requested artworks will appear here for SHA-256 Hash generation.')}
              </p>
            </div>
          ) : (
            <DataTable rows={artworks.map(art => ({ ...art, id: String(art.id) }))} headers={[
              { key: 'title', header: t('Obra / SKU', 'Artwork / SKU') },
              { key: 'buyer', header: t('Comprador / Nota', 'Buyer / Note') },
              { key: 'status', header: t('Estado', 'Status') },
              { key: 'hash', header: t('Hash / Emisión', 'Hash / Issuance') },
              { key: 'action', header: t('Acción', 'Action') }
            ]}>
              {({ rows, headers, getHeaderProps, getRowProps }) => (
                <TableContainer style={{ backgroundColor: 'transparent' }}>
                  <Table>
                    <TableHead>
                      <TableRow style={{ backgroundColor: 'var(--cds-layer-02)' }}>
                        {headers.map((header) => {
                          const headerProps = getHeaderProps({ header })
                          return (
                            <TableHeader 
                              key={header.key} 
                              {...headerProps}
                              style={{ 
                                fontSize: '0.7rem', 
                                fontFamily: 'var(--cds-code-font-family, monospace)', 
                                textTransform: 'uppercase', 
                                letterSpacing: '0.05em',
                                color: 'var(--cds-text-secondary)',
                                borderBottom: '1px solid var(--cds-border-subtle)'
                              }}
                            >
                              {header.header}
                            </TableHeader>
                          )
                        })}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => {
                        const art = artworks.find(a => String(a.id) === row.id) || {}
                        
                        const hasHash = Boolean(art.certificate_hash)
                        const isVerified = hasHash && (art.ownership_status === 'VERIFIED' || art.ownership_status === 'CLAIMED' || art.ownership_status === 'SOLD')
                        const isPending = !hasHash || art.ownership_status === 'CLAIM_PENDING' || art.certificate_status === 'PENDING_ISSUANCE'

                        const userProfile = art.pending_profile || art.owner_profile || art.profiles
                        const targetUserId = art.pending_owner_id || art.current_owner_id

                        return (
                          <TableRow key={row.id} {...getRowProps({ row })} style={{ borderBottom: '1px solid var(--cds-border-subtle)' }}>
                            
                            {/* DETALLE DE OBRA CON MINIATURA */}
                            <TableCell style={{ verticalAlign: 'middle' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                                <div style={{ width: '3rem', height: '3rem', backgroundColor: 'var(--cds-layer-02)', border: '1px solid var(--cds-border-subtle)', borderRadius: '4px', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
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

                            {/* DATOS DEL COMPRADOR */}
                            <TableCell style={{ verticalAlign: 'middle' }}>
                              <div style={{ color: 'var(--cds-text-primary)', fontWeight: 500 }}>
                                {userProfile?.full_name || t('Usuario Registrado', 'Registered User')}
                              </div>
                              <div style={{ fontFamily: 'var(--cds-code-font-family, monospace)', fontSize: '0.7rem', color: 'var(--cds-text-secondary)', marginTop: '0.2rem' }}>
                                {userProfile?.email || targetUserId || t('Sin asignación', 'Not assigned')}
                              </div>
                              {art.claim_notes && (
                                <div style={{ fontSize: '0.75rem', color: '#f1c21b', fontStyle: 'italic', marginTop: '0.35rem', padding: '0.35rem 0.5rem', backgroundColor: 'var(--cds-layer-02)', borderRadius: '4px', border: '1px solid var(--cds-border-subtle)' }}>
                                  &quot;{art.claim_notes}&quot;
                                </div>
                              )}
                            </TableCell>

                            {/* ESTADO */}
                            <TableCell style={{ verticalAlign: 'middle' }}>
                              {isVerified ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.5rem', backgroundColor: 'rgba(36, 161, 72, 0.1)', border: '1px solid rgba(36, 161, 72, 0.3)', color: '#42be65', fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', borderRadius: '1rem' }}>
                                  ✅ {t('Emitido & Verificado', 'Issued & Verified')}
                                </span>
                              ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.5rem', backgroundColor: 'rgba(241, 194, 27, 0.1)', border: '1px solid rgba(241, 194, 27, 0.3)', color: '#f1c21b', fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', borderRadius: '1rem' }}>
                                  ⏳ {t('Pendiente de Firma', 'Pending Signature')}
                                </span>
                              )}
                            </TableCell>

                            {/* HASH / EMISIÓN */}
                            <TableCell style={{ verticalAlign: 'middle', fontFamily: 'var(--cds-code-font-family, monospace)', fontSize: '0.7rem', color: 'var(--cds-text-secondary)' }}>
                              {art.certificate_hash ? (
                                <span style={{ color: '#f1c21b' }} title={art.certificate_hash}>
                                  {art.certificate_hash.substring(0, 16)}...
                                </span>
                              ) : (
                                <span style={{ color: 'var(--cds-text-helper)', fontStyle: 'italic' }}>{t('Sin Hash emitido', 'No Hash issued')}</span>
                              )}
                            </TableCell>

                            {/* BOTÓN DE ACCIÓN */}
                            <TableCell style={{ verticalAlign: 'middle', textAlign: 'right' }}>
                              {isPending && (
                                <Button
                                  onClick={() => handleApprove(art.id, targetUserId)}
                                  disabled={processingId === art.id || !targetUserId}
                                  kind="primary"
                                  size="sm"
                                  renderIcon={Pen}
                                >
                                  {processingId === art.id ? t('Emitiendo...', 'Issuing...') : t('Autorizar & Firmar', 'Authorize & Sign')}
                                </Button>
                              )}
                              {isVerified && (
                                <Button
                                  as="a"
                                  href={`/verify/${art.sku}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  kind="ghost"
                                  size="sm"
                                  renderIcon={Launch}
                                >
                                  {t('Ver Registro', 'View Record')}
                                </Button>
                              )}
                            </TableCell>

                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </DataTable>
          )}
        </Tile>

      </div>
    </div>
  )
}