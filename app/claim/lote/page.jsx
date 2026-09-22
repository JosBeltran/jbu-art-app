'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import ArtworkImage from '@/components/ArtworkImage'
import { 
  Tile, 
  Button, 
  InlineLoading, 
  InlineNotification 
} from '@carbon/react'
import { Checkmark, Key, Renew } from '@carbon/icons-react'

function ClaimLoteContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const router = useRouter()

  const [groupData, setGroupData] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [user, setUser] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))

    async function loadGroup() {
      if (!token) {
        setLoading(false)
        return
      }

      // 1. Obtener el grupo
      const { data: group } = await supabase
        .from('claim_groups')
        .select('*')
        .eq('group_token', token)
        .single()

      if (group) {
        setGroupData(group)
        // 2. Obtener los items asignados al grupo trayendo los datos de la imagen de artworks
        const { data: groupItems } = await supabase
          .from('order_items')
          .select(`
            *,
            artworks (
              *
            )
          `)
          .eq('claim_group_id', group.id)

        if (groupItems) setItems(groupItems)
      }
      setLoading(false)
    }

    loadGroup()
  }, [token])

  const handleClaimAll = async () => {
    if (!user) {
      // Redirigir a login guardando la URL actual
      const currentUrl = encodeURIComponent(`/claim/lote?token=${token}`)
      router.push(`/login?redirectTo=${currentUrl}`)
      return
    }

    setClaiming(true)

    // Reclamar todos los ítems no reclamados del lote
    const itemIds = items.filter((i) => !i.is_claimed).map((i) => i.id)
    
    if (itemIds.length === 0) {
      setClaiming(false)
      return
    }

    const { error } = await supabase
      .from('order_items')
      .update({
        is_claimed: true,
        claimed_by_user_id: user.id,
        claimed_at: new Date().toISOString()
      })
      .in('id', itemIds)

    if (error) {
      alert('Error al reclamar las obras: ' + error.message)
      setClaiming(false)
    } else {
      router.push('/coleccion?claimed=success')
    }
  }

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        backgroundColor: 'var(--cds-background)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '2rem' 
      }}>
        <InlineLoading description="Cargando lote..." />
      </div>
    )
  }

  if (!groupData) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        backgroundColor: 'var(--cds-background)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '2rem' 
      }}>
        <InlineNotification
          lowContrast
          kind="error"
          title="Lote no disponible"
          subtitle="Lote no encontrado o expirado."
          hideCloseButton
        />
      </div>
    )
  }

  const unclaimedItems = items.filter((i) => !i.is_claimed)

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--cds-background)',
      color: 'var(--cds-text-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      boxSizing: 'border-box',
      fontFamily: 'sans-serif'
    }}>
      <Tile style={{ 
        maxWidth: '32rem', 
        width: '100%', 
        backgroundColor: 'var(--cds-layer-01)', 
        border: '1px solid var(--cds-border-subtle)', 
        borderRadius: '1.5rem', 
        padding: '2rem', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '1.5rem' 
      }}>
        
        {/* ENCABEZADO */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f1c21b', display: 'inline-block' }}></span>
            <span style={{ fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#f1c21b' }}>
              Estudio JBU — Colección Especial
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontFamily: 'serif', fontWeight: 300, margin: 0 }}>
            ¡Hola, {groupData.buyer_name}!
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--cds-text-secondary)', margin: 0 }}>
            Tienes {unclaimedItems.length} obra(s) lista(s) para vincular a tu Certificado Digital.
          </p>
        </div>

        {/* LISTA DE OBRAS DEL LOTE */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '20rem', overflowY: 'auto', paddingRight: '0.25rem' }}>
          {items.map((item) => {
            const artData = item.artworks
            const primaryUrl = artData?.primary_image_url || artData?.image_url || (Array.isArray(artData?.images) ? artData.images[0] : null)

            return (
              <div 
                key={item.id} 
                style={{ 
                  padding: '0.75rem', 
                  backgroundColor: 'var(--cds-layer-02)', 
                  borderRadius: '0.75rem', 
                  border: '1px solid var(--cds-border-subtle)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '1rem' 
                }}
              >
                {/* Contenedor de la Imagen con ArtworkImage */}
                <div style={{ width: '4rem', height: '4rem', position: 'relative', borderRadius: '0.5rem', overflow: 'hidden', backgroundColor: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', flexShrink: 0 }}>
                  <ArtworkImage
                    title={item.title_snapshot}
                    primaryUrl={primaryUrl}
                    sku={item.sku_snapshot}
                    className="object-cover w-full h-full"
                  />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: '#f1c21b', margin: '0 0 0.2rem 0' }}>
                    [{item.sku_snapshot}]
                  </p>
                  <p style={{ fontSize: '0.875rem', fontWeight: 'bold', margin: '0 0 0.2rem 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.title_snapshot}
                  </p>
                  {item.unit_price_mxn && (
                    <p style={{ fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)', margin: 0 }}>
                      ${Number(item.unit_price_mxn).toLocaleString()} MXN
                    </p>
                  )}
                </div>

                {item.is_claimed && (
                  <span style={{ fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: '#42be65', backgroundColor: 'rgba(36, 161, 72, 0.1)', border: '1px solid rgba(36, 161, 72, 0.3)', padding: '0.2rem 0.5rem', borderRadius: '1rem', flexShrink: 0 }}>
                    Reclamado
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* ACCIÓN DE RECLAMO */}
        {unclaimedItems.length > 0 ? (
          <Button
            onClick={handleClaimAll}
            disabled={claiming}
            kind="primary"
            size="lg"
            renderIcon={user ? Checkmark : Key}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {claiming
              ? 'Vinculando obras...'
              : user
              ? 'Reclamar Todas Mis Obras'
              : 'Registrarme / Iniciar Sesión para Reclamar'}
          </Button>
        ) : (
          <p style={{ textAlign: 'center', fontSize: '0.75rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: '#42be65', margin: 0 }}>
            ✓ Todas las obras de este lote ya se encuentran en una colección.
          </p>
        )}

      </Tile>
    </div>
  )
}

export default function ClaimLotePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: 'var(--cds-background)' }} />}>
      <ClaimLoteContent />
    </Suspense>
  )
}