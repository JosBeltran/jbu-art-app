'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import ArtworkImage from '@/components/ArtworkImage'
import {
  Tile,
  Button,
  TextInput,
  InlineLoading,
  InlineNotification,
  Checkbox,
  Tag
} from '@carbon/react'
import { Copy, Renew, ArrowRight } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import styles from './Claims.module.css'

export default function AdminClaimGroupsPage() {
  const { t, locale } = useI18n()
  const [availableArtworks, setAvailableArtworks] = useState([])
  const [selectedArtworkIds, setSelectedArtworkIds] = useState([])
  const [buyerName, setBuyerName] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')
  const [generatedLink, setGeneratedLink] = useState('')
  const [copiedToken, setCopiedToken] = useState(null)
  const [loading, setLoading] = useState(false)

  // Historial de lotes
  const [existingGroups, setExistingGroups] = useState([])
  const [loadingGroups, setLoadingGroups] = useState(true)

  // READY FOR CLAIM: obras vendidas elegibles según el servidor
  // (availability SOLD + ownership SOLD + sin propietario + sin reclamo activo).
  // Nunca se exige cambiar ownership_status a AVAILABLE.
  const [needsReviewArtworks, setNeedsReviewArtworks] = useState([])

  const fetchAvailableArtworks = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/claim-eligible')
      const data = await res.json()
      if (res.ok) {
        setAvailableArtworks(data.ready || [])
        setNeedsReviewArtworks(data.needsReview || [])
      } else {
        console.error('Error al consultar obras listas para reclamo:', data.error)
      }
    } catch (err) {
      console.error('Error al consultar inventario disponible:', err)
    }
  }, [])

  const fetchClaimGroups = useCallback(async () => {
    setLoadingGroups(true)
    try {
      const res = await fetch('/api/admin/get-claim-groups')
      const data = await res.json()

      if (res.ok && data.groups) {
        setExistingGroups(data.groups)
      } else {
        console.error('Error al obtener lotes:', data.error)
      }
    } catch (err) {
      console.error('Error de red al consultar lotes:', err)
    } finally {
      setLoadingGroups(false)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadData = async () => {
      if (isMounted) {
        await Promise.all([fetchAvailableArtworks(), fetchClaimGroups()])
      }
    }

    loadData()

    return () => {
      isMounted = false
    }
  }, [fetchAvailableArtworks, fetchClaimGroups])

  const toggleSelect = (id) => {
    setSelectedArtworkIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const handleCreateGroup = async () => {
    if (selectedArtworkIds.length === 0 || !buyerName.trim()) {
      alert(t('Selecciona al menos una obra e ingresa el nombre del cliente.', 'Select at least one artwork and enter the client name.'))
      return
    }

    setLoading(true)
    const selectedArtworks = availableArtworks.filter((art) => selectedArtworkIds.includes(art.id))

    try {
      const res = await fetch('/api/admin/create-claim-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerName,
          buyerPhone,
          selectedArtworks,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || t('Error al procesar el lote', 'Error processing the batch'))
      }

      const domain = typeof window !== 'undefined' ? window.location.origin : ''
      const url = `${domain}/claim/lote?token=${data.group_token}`
      setGeneratedLink(url)

      // Actualizar vista local
      setAvailableArtworks((prev) => prev.filter((art) => !selectedArtworkIds.includes(art.id)))
      setSelectedArtworkIds([])
      setBuyerName('')
      setBuyerPhone('')

      // Recargar lotes
      fetchClaimGroups()
    } catch (err) {
      alert(t('Error: ', 'Error: ') + err.message)
    } finally {
      setLoading(false)
    }
  }

  const copyTextToClipboard = async (text, identifier) => {
    let copySuccess = false

    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text)
        copySuccess = true
      } catch (err) {
        console.error('Error en navigator.clipboard:', err)
      }
    }

    if (!copySuccess) {
      try {
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        copySuccess = document.execCommand('copy')
        document.body.removeChild(textArea)
      } catch (err) {
        console.error('Error en fallback execCommand:', err)
      }
    }

    if (copySuccess) {
      setCopiedToken(identifier)
      setTimeout(() => setCopiedToken(null), 3000)
    } else {
      alert(t('Error al copiar el texto al portapapeles.', 'Error copying text to clipboard.'))
    }
  }

  const copyFormattedMessage = (name, link, identifier) => {
    const msg = t(
      `¡Hola ${name}! 👋\n\nTe comparto el enlace para registrar y reclamar los Certificados Digitales de Autenticidad de tus obras en Estudio JBU:\n\n👉 ${link}\n\nSolo ingresa al enlace, crea tu cuenta o inicia sesión y se vincularán automáticamente a tu colección.`,
      `Hi ${name}! 👋\n\nHere is the link to register and claim the Digital Certificates of Authenticity for your artworks at Estudio JBU:\n\n👉 ${link}\n\nJust open the link, create your account or sign in, and they will be automatically linked to your collection.`
    )
    copyTextToClipboard(msg, identifier)
  }

  return (
    <div className={styles.shell}>
      <div className={styles.inner}>

        {/* ENCABEZADO */}
        <header className={styles.header}>
          <p className={styles.kicker}>
            {t('Módulo de Vinculación Directa', 'Direct Linking Module')}
          </p>
          <h1 className={styles.title}>
            {t('Agrupador de Reclamos // Lotes', 'Claim Grouper // Batches')}
          </h1>
          <p className={styles.subtitle}>
            {t('Generación de tokens multiobra para emisión de Certificados Digitales COA.', 'Generation of multi-artwork tokens for issuing Digital COA Certificates.')}
          </p>
        </header>

        {/* PANEL PRINCIPAL: CONFIGURACIÓN DE LOTE */}
        <Tile className={styles.panel}>

          {/* PASO 1 */}
          <div className={styles.section}>
            <h2 className={styles.sectionLabel}>
              {t('01 — Datos del Receptor / Cliente', '01 — Recipient / Client Data')}
            </h2>

            <div className={styles.formGrid}>
              <TextInput
                id="buyerName"
                labelText=""
                placeholder={t('Nombre completo del titular (Ej. Carlos Ruiz)', 'Full name of the holder (E.g. Carlos Ruiz)')}
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
              />
              <TextInput
                id="buyerPhone"
                labelText=""
                placeholder={t('Teléfono móvil / WhatsApp (Opcional)', 'Mobile phone / WhatsApp (Optional)')}
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
              />
            </div>
          </div>

          {/* PASO 2 */}
          <div className={styles.sectionBordered}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionLabel}>
                {t('02 — Obras listas para reclamo', '02 — Artworks ready for claim')}
              </h2>
              <Tag type="cool-gray" size="sm">
                {t('SELECCIONADAS', 'SELECTED')}: {selectedArtworkIds.length}
              </Tag>
            </div>

            <div className={styles.artworkList}>
              {availableArtworks.length === 0 ? (
                <Tile className={styles.empty}>
                  <p>{t('No hay obras vendidas pendientes de reclamación.', 'No sold artworks are pending claim.')}</p>
                </Tile>
              ) : (
                availableArtworks.map((art) => {
                  const isSelected = selectedArtworkIds.includes(art.id)
                  const primaryUrl =
                    art.primary_image_url ||
                    art.image_url ||
                    (Array.isArray(art.images) ? art.images[0] : null)

                  return (
                    <div
                      key={art.id}
                      onClick={() => toggleSelect(art.id)}
                      className={isSelected ? styles.artworkRowSelected : styles.artworkRow}
                    >
                      <div className={styles.artworkRowInner}>
                        <Checkbox
                          id={`art-${art.id}`}
                          labelText=""
                          checked={isSelected}
                          onChange={() => toggleSelect(art.id)}
                          onClick={(e) => e.stopPropagation()}
                        />

                        <div className={styles.thumb}>
                          <ArtworkImage
                            title={art.title}
                            primaryUrl={primaryUrl}
                            sku={art.sku}
                            className="object-cover w-full h-full"
                          />
                        </div>

                        <div className={styles.artworkMeta}>
                          <span className={styles.artworkTitle}>{art.title}</span>
                          <span className={styles.artworkSku}>
                            {t('SKU', 'SKU')}: {art.sku || t('N/D', 'N/A')} {art.price ? `• $${Number(art.price).toLocaleString()} MXN` : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* ACCIÓN DE GENERACIÓN */}
          <Button
            onClick={handleCreateGroup}
            disabled={loading || selectedArtworkIds.length === 0}
            kind="primary"
            size="lg"
            renderIcon={ArrowRight}
            className={styles.submitButton}
          >
            {loading ? t('Generando Lote Encriptado...', 'Generating Encrypted Batch...') : t('Generar Link de Reclamo Agrupado', 'Generate Grouped Claim Link')}
          </Button>

        </Tile>

        {/* NOTIFICACIÓN DE LOTE CREADO */}
        {generatedLink && (
          <Tile className={styles.panel}>
            <div className={styles.successPanel}>
              <InlineNotification
                kind="success"
                title={t('Enlace de Lote Creado con Éxito', 'Batch Link Created Successfully')}
                subtitle={t('Comparte este enlace con el cliente para que reclame sus certificados.', 'Share this link with the client so they can claim their certificates.')}
                lowContrast
                hideCloseButton
              />

              <TextInput
                id="generatedLinkInput"
                labelText=""
                readOnly
                value={generatedLink}
              />

              <div className={styles.successActions}>
                <Button
                  onClick={() => copyFormattedMessage('Cliente', generatedLink, 'newly-created')}
                  kind="tertiary"
                  size="sm"
                  renderIcon={Copy}
                >
                  {copiedToken === 'newly-created' ? t('¡Mensaje Copiado!', 'Message Copied!') : t('Copiar Mensaje Completo para WhatsApp', 'Copy Full Message for WhatsApp')}
                </Button>
              </div>
            </div>
          </Tile>
        )}

        {/* NEEDS REVIEW: combinaciones contradictorias heredadas; nunca comprables */}
        {needsReviewArtworks.length > 0 && (
          <section className={styles.history}>
            <div className={styles.historyHead}>
              <h2 className={styles.historyTitle}>
                {t('Requieren revisión', 'Needs review')} ({needsReviewArtworks.length})
              </h2>
            </div>
            <InlineNotification
              kind="warning"
              title={t('Estatus contradictorio', 'Contradictory status')}
              subtitle={t('Estas obras combinan catálogo OWNED, propiedad AVAILABLE y un propietario asignado. No se muestran como comprables ni entran a lotes hasta corregirlas a mano.', 'These artworks combine OWNED catalog status, AVAILABLE ownership and an assigned owner. They are not purchasable and cannot join batches until fixed manually.')}
              lowContrast
              hideCloseButton
            />
            <div className={styles.groupList}>
              {needsReviewArtworks.map((art) => (
                <Tile key={art.id} className={styles.groupCard}>
                  <div className={styles.groupHead}>
                    <div className={styles.groupMeta}>
                      <h3 className={styles.groupBuyer}>{art.title}</h3>
                      <p className={styles.groupToken}>
                        {t('SKU', 'SKU')}: {art.sku || t('N/D', 'N/A')} • {t('CATÁLOGO', 'CATALOG')}: {art.status} • {t('PROPIEDAD', 'OWNERSHIP')}: {art.ownership_status}
                      </p>
                    </div>
                    <Tag type="warm-gray" size="sm">{t('NEEDS REVIEW', 'NEEDS REVIEW')}</Tag>
                  </div>
                </Tile>
              ))}
            </div>
          </section>
        )}

        {/* HISTORIAL DE LOTES REGISTRADOS */}
        <section className={styles.history}>
          <div className={styles.historyHead}>
            <h2 className={styles.historyTitle}>
              {t('Lotes Registrados', 'Registered Batches')} ({existingGroups.length})
            </h2>
            <Button
              onClick={fetchClaimGroups}
              kind="ghost"
              size="sm"
              renderIcon={Renew}
            >
              {t('Actualizar', 'Refresh')}
            </Button>
          </div>

          {loadingGroups ? (
            <div className={styles.loading}>
              <InlineLoading description={t('Consultando base de lotes...', 'Querying batch database...')} />
            </div>
          ) : existingGroups.length === 0 ? (
            <Tile className={styles.empty}>
              <p>{t('No hay lotes creados previamente.', 'No batches have been created previously.')}</p>
            </Tile>
          ) : (
            <div className={styles.groupList}>
              {existingGroups.map((group) => {
                const domain = typeof window !== 'undefined' ? window.location.origin : ''
                const groupUrl = `${domain}/claim/lote?token=${group.group_token}`
                const totalItems = group.order_items?.length || 0
                const claimedItems = group.order_items?.filter((i) => i.is_claimed)?.length || 0
                const isComplete = totalItems > 0 && claimedItems === totalItems

                return (
                  <Tile key={group.id} className={styles.groupCard}>
                    <div className={styles.groupHead}>
                      <div className={styles.groupMeta}>
                        <h3 className={styles.groupBuyer}>
                          {group.buyer_name}
                        </h3>
                        <p className={styles.groupToken}>
                          {t('TOKEN', 'TOKEN')}: {group.group_token.substring(0, 16)}... • {t('CREADO', 'CREATED')}: {new Date(group.created_at).toLocaleString(locale)}
                        </p>
                      </div>

                      <div className={styles.groupActions}>
                        <Tag type={isComplete ? 'green' : 'teal'} size="sm">
                          {claimedItems} / {totalItems} {t('Reclamadas', 'Claimed')}
                        </Tag>

                        <Button
                          onClick={() => copyFormattedMessage(group.buyer_name, groupUrl, group.id)}
                          kind="secondary"
                          size="sm"
                          renderIcon={Copy}
                        >
                          {copiedToken === group.id ? t('Copiado', 'Copied') : t('Copiar Mensaje', 'Copy Message')}
                        </Button>
                      </div>
                    </div>

                    {/* LISTA DE OBRAS DEL LOTE */}
                    <div className={styles.groupItems}>
                      {group.order_items?.map((item) => {
                        const artData = item.artworks
                        const primaryUrl =
                          artData?.primary_image_url ||
                          artData?.image_url ||
                          (Array.isArray(artData?.images) ? artData.images[0] : null)

                        return (
                          <div key={item.id} className={styles.groupItem}>
                            <div className={styles.thumbSmall}>
                              <ArtworkImage
                                title={item.title_snapshot}
                                primaryUrl={primaryUrl}
                                sku={item.sku_snapshot}
                                className="object-cover w-full h-full"
                              />
                            </div>
                            <div className={styles.groupItemMeta}>
                              <p className={styles.groupItemTitle}>
                                {item.title_snapshot}
                              </p>
                              <p className={styles.groupItemSku}>
                                [{item.sku_snapshot}]
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </Tile>
                )
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
