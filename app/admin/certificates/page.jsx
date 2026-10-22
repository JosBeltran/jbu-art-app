'use client'

import { useState, useEffect } from 'react'
import {
  Tile,
  Button,
  InlineLoading,
  InlineNotification,
  Tag,
  DataTable,
  Table,
  TableHead,
  TableContainer,
  TableRow,
  TableHeader,
  TableBody,
  TableCell
} from '@carbon/react'
import { Renew, Launch, Pen } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import styles from './Certificates.module.css'
import { authHeaders } from '@/lib/authHeaders'

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
      const res = await fetch('/api/admin/pending-claims', { headers: await authHeaders() })
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
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
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
    <div className={styles.shell}>
      <div className={styles.inner}>

        {/* ENCABEZADO ADMIN */}
        <header className={styles.header}>
          <div className={styles.headerInfo}>
            <p className={styles.kicker}>
              {t('Estudio JBU — Control de Autenticidad', 'Estudio JBU — Authenticity Control')}
            </p>
            <h1 className={styles.title}>
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
          <InlineNotification
            kind={message.type === 'success' ? 'success' : 'error'}
            title={message.type === 'success' ? t('Éxito', 'Success') : t('Error', 'Error')}
            subtitle={message.text}
            lowContrast
            hideCloseButton={false}
            onCloseButtonClick={() => setMessage(null)}
          />
        )}

        {/* TABLA DE SOLICITUDES */}
        <Tile className={styles.tableContainer}>
          {loading ? (
            <div className={styles.loading}>
              <InlineLoading description={t('Cargando solicitudes de registro...', 'Loading registration requests...')} />
            </div>
          ) : artworks.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>
                {t('No hay solicitudes de certificados pendientes por autorizar.', 'There are no pending certificate requests to authorize.')}
              </p>
              <p className={styles.emptyHint}>
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
                      <TableRow>
                        {headers.map((header) => {
                          const headerProps = getHeaderProps({ header })
                          return (
                            <TableHeader
                              key={header.key}
                              {...headerProps}
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
                          <TableRow key={row.id} {...getRowProps({ row })}>

                            {/* DETALLE DE OBRA CON MINIATURA */}
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
                                    <div className={styles.thumbEmpty}>
                                      S/I
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <p className={styles.artworkTitle}>
                                    {art.title}
                                  </p>
                                  <span className={styles.sku}>
                                    {art.sku?.toUpperCase()}
                                  </span>
                                </div>
                              </div>
                            </TableCell>

                            {/* DATOS DEL COMPRADOR */}
                            <TableCell>
                              <div className={styles.buyerName}>
                                {userProfile?.full_name || t('Usuario Registrado', 'Registered User')}
                              </div>
                              <div className={styles.buyerEmail}>
                                {userProfile?.email || targetUserId || t('Sin asignación', 'Not assigned')}
                              </div>
                              {art.claim_notes && (
                                <div className={styles.claimNotes}>
                                  &quot;{art.claim_notes}&quot;
                                </div>
                              )}
                            </TableCell>

                            {/* ESTADO */}
                            <TableCell>
                              {isVerified ? (
                                <Tag type="green" size="sm">
                                  {t('Emitido & Verificado', 'Issued & Verified')}
                                </Tag>
                              ) : (
                                <Tag type="teal" size="sm">
                                  {t('Pendiente de Firma', 'Pending Signature')}
                                </Tag>
                              )}
                            </TableCell>

                            {/* HASH / EMISIÓN */}
                            <TableCell>
                              {art.certificate_hash ? (
                                <span className={styles.hash} title={art.certificate_hash}>
                                  {art.certificate_hash.substring(0, 16)}...
                                </span>
                              ) : (
                                <span className={styles.hashEmpty}>{t('Sin Hash emitido', 'No Hash issued')}</span>
                              )}
                            </TableCell>

                            {/* BOTÓN DE ACCIÓN */}
                            <TableCell className={styles.actions}>
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
