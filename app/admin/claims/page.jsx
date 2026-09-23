'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import ArtworkImage from '@/components/ArtworkImage'
import { 
  Tile, 
  Button, 
  TextInput, 
  InlineLoading, 
  Checkbox, 
  Tag 
} from '@carbon/react'
import { Copy, Renew, ArrowRight, Checkmark } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'

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

  const fetchAvailableArtworks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('artworks')
        .select('*')
        .eq('status', 'AVAILABLE')
        .order('created_at', { ascending: false })

      if (error) throw error
      if (data) setAvailableArtworks(data)
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
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--cds-background)',
      color: 'var(--cds-text-primary)',
      padding: '2.5rem 1.5rem',
      boxSizing: 'border-box'
    }}>
      <div style={{ maxWidth: '72rem', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
        
        {/* HEADER INDUSTRIAL */}
        <header style={{ borderBottom: '1px solid var(--cds-border-subtle)', paddingBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f1c21b', display: 'inline-block' }}></span>
            <span style={{ fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', letterSpacing: '0.1em', color: '#f1c21b', textTransform: 'uppercase' }}>
              {t('Módulo de Vinculación Directa', 'Direct Linking Module')}
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontFamily: 'serif', fontWeight: 300, color: 'var(--cds-text-primary)', margin: 0 }}>
            {t('Agrupador de Reclamos // Lotes', 'Claim Grouper // Batches')}
          </h1>
          <p style={{ fontSize: '0.8rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)', margin: 0 }}>
            {t('Generación de tokens multiobra para emisión de Certificados Digitales COA.', 'Generation of multi-artwork tokens for issuing Digital COA Certificates.')}
          </p>
        </header>

        {/* PANEL PRINCIPAL: CONFIGURACIÓN DE LOTE */}
        <Tile style={{ padding: '2rem', backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* PASO 1 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontFamily: 'var(--cds-code-font-family, monospace)', fontSize: '0.75rem', color: '#f1c21b', backgroundColor: 'rgba(241, 194, 27, 0.1)', border: '1px solid rgba(241, 194, 27, 0.3)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                01
              </span>
              <h2 style={{ fontSize: '0.75rem', fontFamily: 'var(--cds-code-font-family, monospace)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--cds-text-secondary)', margin: 0 }}>
                {t('Datos del Receptor / Cliente', 'Recipient / Client Data')}
              </h2>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '1.5rem', borderTop: '1px solid var(--cds-border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontFamily: 'var(--cds-code-font-family, monospace)', fontSize: '0.75rem', color: '#f1c21b', backgroundColor: 'rgba(241, 194, 27, 0.1)', border: '1px solid rgba(241, 194, 27, 0.3)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                  02
                </span>
                <h2 style={{ fontSize: '0.75rem', fontFamily: 'var(--cds-code-font-family, monospace)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--cds-text-secondary)', margin: 0 }}>
                  {t('Selección de Obras Disponibles', 'Selection of Available Artworks')}
                </h2>
              </div>
              <span style={{ fontFamily: 'var(--cds-code-font-family, monospace)', fontSize: '0.75rem', color: '#f1c21b', backgroundColor: 'var(--cds-layer-02)', border: '1px solid var(--cds-border-subtle)', padding: '0.25rem 0.75rem', borderRadius: '4px' }}>
                {t('SELECCIONADAS', 'SELECTED')}: {selectedArtworkIds.length}
              </span>
            </div>

            <div style={{ maxHeight: '20rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.25rem' }}>
              {availableArtworks.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--cds-layer-02)', border: '1px solid var(--cds-border-subtle)', borderRadius: '4px' }}>
                  <p style={{ fontSize: '0.8rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-helper)', margin: 0 }}>{t('Sin obras disponibles en inventario.', 'No artworks available in inventory.')}</p>
                </div>
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
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem 1rem',
                        borderRadius: '4px',
                        border: '1px solid',
                        borderColor: isSelected ? 'rgba(241, 194, 27, 0.5)' : 'var(--cds-border-subtle)',
                        backgroundColor: isSelected ? 'rgba(241, 194, 27, 0.05)' : 'var(--cds-layer-02)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
                        <Checkbox
                          id={`art-${art.id}`}
                          labelText=""
                          checked={isSelected}
                          onChange={() => toggleSelect(art.id)}
                          onClick={(e) => e.stopPropagation()}
                        />

                        <div style={{ width: '3rem', height: '3rem', position: 'relative', borderRadius: '4px', overflow: 'hidden', backgroundColor: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', flexShrink: 0 }}>
                          <ArtworkImage
                            title={art.title}
                            primaryUrl={primaryUrl}
                            sku={art.sku}
                            className="object-cover w-full h-full"
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: '0.15rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--cds-text-primary)', fontSize: '0.85rem', fontFamily: 'var(--cds-code-font-family, monospace)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{art.title}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--cds-text-secondary)', fontFamily: 'var(--cds-code-font-family, monospace)' }}>
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
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {loading ? t('Generando Lote Encriptado...', 'Generating Encrypted Batch...') : t('Generar Link de Reclamo Agrupado', 'Generate Grouped Claim Link')}
          </Button>

        </Tile>

        {/* NOTIFICACIÓN DE LOTE CREADO */}
        {generatedLink && (
          <Tile style={{ padding: '1.5rem', backgroundColor: 'rgba(36, 161, 72, 0.05)', border: '1px solid rgba(36, 161, 72, 0.3)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Checkmark style={{ fill: '#42be65' }} />
              <h3 style={{ fontSize: '0.75rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: '#42be65', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                {t('Enlace de Lote Creado con Éxito', 'Batch Link Created Successfully')}
              </h3>
            </div>

            <TextInput
              id="generatedLinkInput"
              labelText=""
              readOnly
              value={generatedLink}
            />

            <div>
              <Button
                onClick={() => copyFormattedMessage('Cliente', generatedLink, 'newly-created')}
                kind="tertiary"
                size="sm"
                renderIcon={Copy}
                style={{ borderColor: 'rgba(36, 161, 72, 0.4)', color: '#42be65' }}
              >
                {copiedToken === 'newly-created' ? t('¡Mensaje Copiado!', 'Message Copied!') : t('Copiar Mensaje Completo para WhatsApp', 'Copy Full Message for WhatsApp')}
              </Button>
            </div>
          </Tile>
        )}

        {/* HISTORIAL DE LOTES REGISTRADOS */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--cds-border-subtle)', paddingBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '0.85rem', fontFamily: 'var(--cds-code-font-family, monospace)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--cds-text-primary)', margin: 0 }}>
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
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <InlineLoading description={t('Consultando base de lotes...', 'Querying batch database...')} />
            </div>
          ) : existingGroups.length === 0 ? (
            <Tile style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)' }}>
              <p style={{ fontSize: '0.8rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)', margin: 0 }}>{t('No hay lotes creados previamente.', 'No batches have been created previously.')}</p>
            </Tile>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {existingGroups.map((group) => {
                const domain = typeof window !== 'undefined' ? window.location.origin : ''
                const groupUrl = `${domain}/claim/lote?token=${group.group_token}`
                const totalItems = group.order_items?.length || 0
                const claimedItems = group.order_items?.filter((i) => i.is_claimed)?.length || 0
                const isComplete = totalItems > 0 && claimedItems === totalItems

                return (
                  <Tile
                    key={group.id}
                    style={{
                      backgroundColor: 'var(--cds-layer-01)',
                      border: '1px solid var(--cds-border-subtle)',
                      padding: '1.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <h3 style={{ fontSize: '1rem', fontFamily: 'serif', fontWeight: 600, color: 'var(--cds-text-primary)', margin: 0 }}>
                          {group.buyer_name}
                        </h3>
                        <p style={{ fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)', margin: 0 }}>
                          {t('TOKEN', 'TOKEN')}: {group.group_token.substring(0, 16)}... • {t('CREADO', 'CREATED')}: {new Date(group.created_at).toLocaleString(locale)}
                        </p>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span style={{
                          padding: '0.2rem 0.6rem',
                          fontSize: '0.7rem',
                          fontFamily: 'var(--cds-code-font-family, monospace)',
                          borderRadius: '4px',
                          border: '1px solid',
                          backgroundColor: isComplete ? 'rgba(36, 161, 72, 0.1)' : 'rgba(241, 194, 27, 0.1)',
                          color: isComplete ? '#42be65' : '#f1c21b',
                          borderColor: isComplete ? 'rgba(36, 161, 72, 0.3)' : 'rgba(241, 194, 27, 0.3)'
                        }}>
                          {claimedItems} / {totalItems} {t('Reclamadas', 'Claimed')}
                        </span>

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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--cds-border-subtle)' }}>
                      {group.order_items?.map((item) => {
                        const artData = item.artworks
                        const primaryUrl =
                          artData?.primary_image_url ||
                          artData?.image_url ||
                          (Array.isArray(artData?.images) ? artData.images[0] : null)

                        return (
                          <div
                            key={item.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.75rem',
                              padding: '0.5rem',
                              backgroundColor: 'var(--cds-layer-02)',
                              borderRadius: '4px',
                              border: '1px solid var(--cds-border-subtle)'
                            }}
                          >
                            <div style={{ width: '2.5rem', height: '2.5rem', position: 'relative', borderRadius: '2px', overflow: 'hidden', backgroundColor: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', flexShrink: 0 }}>
                              <ArtworkImage
                                title={item.title_snapshot}
                                primaryUrl={primaryUrl}
                                sku={item.sku_snapshot}
                                className="object-cover w-full h-full"
                              />
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <p style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--cds-text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--cds-code-font-family, monospace)' }}>
                                {item.title_snapshot}
                              </p>
                              <p style={{ fontSize: '0.65rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)', margin: 0 }}>
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