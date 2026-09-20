'use client'

import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import { 
  Tile, 
  Button, 
  InlineLoading, 
  ProgressIndicator, 
  ProgressStep 
} from '@carbon/react'
import { ArrowRight, DeliveryTruck, Package, Checkmark, Warning } from '@carbon/icons-react'

export default function OrderTrackingPage({ params }) {
  const { id } = use(params)

  const [order, setOrder] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const fetchOrderDetails = async () => {
      setLoading(true)

      // Cargar cabecera de la orden
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single()

      if (orderError || !orderData) {
        setErrorMsg('No se encontró la orden especificada. Verifica el número de pedido.')
        setLoading(false)
        return
      }

      setOrder(orderData)

      // Cargar ítems comprados junto con su estado de reclamo y datos de lote
      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select(`
          *,
          claim_groups ( group_token ),
          artworks ( sku, primary_image_url)
        `)
        .eq('order_id', id)

      if (itemsError) {
        console.error('Error al obtener ítems:', itemsError)
      } else if (itemsData) {
        setItems(itemsData)
      }

      setLoading(false)
    }

    if (id) {
      fetchOrderDetails()
    }
  }, [id])

  // Mapeo de estados de la orden a índices de Carbon ProgressIndicator
  // 0: PAYMENT_RECEIVED, 1: PROCESSING, 2: SHIPPED, 3: DELIVERED
  const getProgressIndex = (status) => {
    switch (status) {
      case 'PAYMENT_RECEIVED': return 0
      case 'PROCESSING': return 1
      case 'SHIPPED': return 2
      case 'DELIVERED': return 3
      case 'CANCELLED': return 0
      default: return 0
    }
  }

  const getStatusBadge = (status) => {
    const map = {
      PAYMENT_RECEIVED: { label: 'Pago Confirmado', style: { backgroundColor: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa', borderColor: 'rgba(139, 92, 246, 0.3)' } },
      PROCESSING: { label: 'En Preparación / Empaque', style: { backgroundColor: 'rgba(241, 194, 27, 0.1)', color: '#f1c21b', borderColor: 'rgba(241, 194, 27, 0.3)' } },
      SHIPPED: { label: 'En Camino / Enviado', style: { backgroundColor: 'rgba(168, 85, 247, 0.1)', color: '#d8b4fe', borderColor: 'rgba(168, 85, 247, 0.3)' } },
      DELIVERED: { label: 'Entregado Exitosamente', style: { backgroundColor: 'rgba(36, 161, 72, 0.1)', color: '#42be65', borderColor: 'rgba(36, 161, 72, 0.3)' } },
      CANCELLED: { label: 'Cancelado', style: { backgroundColor: 'rgba(218, 30, 40, 0.1)', color: '#ff8389', borderColor: 'rgba(218, 30, 40, 0.3)' } }
    }
    const current = map[status] || { label: status, style: { backgroundColor: 'var(--cds-layer-02)', color: 'var(--cds-text-secondary)', borderColor: 'var(--cds-border-subtle)' } }
    
    return (
      <span style={{
        padding: '0.25rem 0.75rem',
        fontSize: '0.75rem',
        fontFamily: 'var(--cds-code-font-family, monospace)',
        borderRadius: '1rem',
        border: '1px solid',
        display: 'inline-block',
        ...current.style
      }}>
        {current.label}
      </span>
    )
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: 'var(--cds-background)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <InlineLoading description="Consultando información del pedido..." />
      </div>
    )
  }

  if (errorMsg) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--cds-background)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
        <Tile style={{ padding: '2rem', maxWidth: '28rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)' }}>
          <p style={{ color: '#ff8389', fontFamily: 'var(--cds-code-font-family, monospace)', fontSize: '0.8rem', margin: 0 }}>🚨 {errorMsg}</p>
          <Link href="/" style={{ fontSize: '0.75rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-link-primary)', textDecoration: 'underline' }}>
            Volver a la Galería
          </Link>
        </Tile>
      </div>
    )
  }

  const currentProgressIndex = getProgressIndex(order.status)
  const isCancelled = order.status === 'CANCELLED'

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--cds-background)',
      color: 'var(--cds-text-primary)',
      padding: '2rem 1.5rem',
      boxSizing: 'border-box'
    }}>
      <div style={{ maxWidth: '48rem', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* ENCABEZADO */}
        <div style={{ borderBottom: '1px solid var(--cds-border-subtle)', paddingBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-link-primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Estado de Pedido — Estudio JBU
            </span>
            {getStatusBadge(order.status)}
          </div>
          <h1 style={{ fontSize: '1.75rem', fontFamily: 'serif', fontWeight: 300, color: 'var(--cds-text-primary)', margin: 0 }}>
            Orden #{order.id.slice(0, 8).toUpperCase()}
          </h1>
          <p style={{ fontSize: '0.8rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)', margin: 0 }}>
            Comprado por <span style={{ color: 'var(--cds-text-primary)' }}>{order.buyer_name}</span> el {new Date(order.created_at).toLocaleDateString('es-MX')}
          </p>
        </div>

        {/* BARRA DE PROGRESO DE CARBON (PROGRESS INDICATOR) */}
        {!isCancelled && (
          <Tile style={{ padding: '1.5rem', backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)' }}>
            <p style={{ fontSize: '0.75rem', fontFamily: 'var(--cds-code-font-family, monospace)', textTransform: 'uppercase', color: 'var(--cds-text-helper)', marginBottom: '1.5rem', letterSpacing: '0.05em' }}>
              Progreso del Envío
            </p>
            <ProgressIndicator currentIndex={currentProgressIndex} vertical={false}>
              <ProgressStep 
                complete={currentProgressIndex > 0} 
                current={currentProgressIndex === 0} 
                label="Pago Confirmado" 
                description="Orden recibida"
              />
              <ProgressStep 
                complete={currentProgressIndex > 1} 
                current={currentProgressIndex === 1} 
                label="En Preparación" 
                description="Empaque especial"
              />
              <ProgressStep 
                complete={currentProgressIndex > 2} 
                current={currentProgressIndex === 2} 
                label="En Camino" 
                description="Paquetería asignada"
              />
              <ProgressStep 
                complete={currentProgressIndex > 3} 
                current={currentProgressIndex === 3} 
                label="Entregado" 
                description="Pedido completado"
              />
            </ProgressIndicator>
          </Tile>
        )}

        {/* DETALLES DE ENVÍO Y GUÍA */}
        <Tile style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)' }}>
          <h2 style={{ fontSize: '0.75rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            🚚 Información de Rastreo y Logística
          </h2>

          {order.tracking_number ? (
            <div style={{ backgroundColor: 'var(--cds-layer-02)', border: '1px solid var(--cds-border-subtle)', borderRadius: '4px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', fontFamily: 'var(--cds-code-font-family, monospace)', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--cds-text-secondary)' }}>Paquetería:</span>
                <span style={{ color: 'var(--cds-text-primary)', fontWeight: 'bold' }}>{order.courier_name || 'Servicio de Paquetería'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--cds-text-secondary)' }}>Número de Guía:</span>
                <span style={{ color: 'var(--cds-link-primary)', fontWeight: 'bold', userSelect: 'all' }}>{order.tracking_number}</span>
              </div>
              {order.tracking_url && (
                <div style={{ paddingTop: '0.5rem' }}>
                  <Button 
                    as="a"
                    href={order.tracking_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    kind="primary"
                    size="sm"
                    renderIcon={ArrowRight}
                    style={{ width: '100%', justifyContent: 'space-between' }}
                  >
                    Rastrear Paquete Directamente
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ backgroundColor: 'var(--cds-layer-02)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--cds-border-subtle)', fontSize: '0.8rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)' }}>
              ⏳ Tu orden está siendo empaquetada con cuidados especiales en el taller. En cuanto asignemos la guía de envío, se actualizará este panel y te llegará una notificación por correo.
            </div>
          )}

          {/* Dirección de Destino */}
          <div style={{ paddingTop: '0.5rem', fontSize: '0.8rem', fontFamily: 'var(--cds-code-font-family, monospace)', display: 'flex', flexDirection: 'column', gap: '0.2rem', color: 'var(--cds-text-secondary)' }}>
            <span style={{ color: 'var(--cds-text-helper)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Dirección de Entrega:</span>
            <p style={{ margin: 0, color: 'var(--cds-text-primary)' }}>{order.shipping_address?.line1} {order.shipping_address?.line2}</p>
            <p style={{ margin: 0 }}>{order.shipping_address?.city}, {order.shipping_address?.state} {order.shipping_address?.postal_code}</p>
            <p style={{ margin: 0, color: 'var(--cds-text-helper)' }}>{order.shipping_address?.country}</p>
          </div>
        </Tile>

        {/* LISTA DE OBRAS EN LA ORDEN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ fontSize: '0.75rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            🖼️ Obras Adquiridas ({items.length})
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {items.map((item) => {
              const isClaimed = item.is_claimed || Boolean(item.claimed_at)
              
              const groupToken = item.claim_groups?.group_token
              const claimUrl = groupToken
                ? `/claim/lote?token=${groupToken}`
                : `/claim?sku=${encodeURIComponent(item.sku_snapshot)}&token=${item.claim_token_snapshot}`

              return (
                <Tile
                  key={item.id}
                  style={{
                    backgroundColor: 'var(--cds-layer-01)',
                    border: '1px solid var(--cds-border-subtle)',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-link-primary)', backgroundColor: 'var(--cds-layer-02)', padding: '0.15rem 0.5rem', borderRadius: '2px', width: 'fit-content' }}>
                      SKU: {item.sku_snapshot}
                    </span>
                    <h3 style={{ fontSize: '1.125rem', fontFamily: 'serif', fontWeight: 500, color: 'var(--cds-text-primary)', margin: 0 }}>{item.title_snapshot}</h3>
                    <p style={{ fontSize: '0.8rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)', margin: 0 }}>
                      ${item.unit_price_mxn?.toLocaleString('es-MX')} MXN
                    </p>
                  </div>

                  <div>
                    {isClaimed ? (
                      <Button
                        as={Link}
                        href="/collection"
                        kind="tertiary"
                        size="sm"
                        style={{ borderColor: 'rgba(36, 161, 72, 0.4)', color: '#42be65' }}
                      >
                        ✓ Certificado Vinculado
                      </Button>
                    ) : (
                      <Button
                        as={Link}
                        href={claimUrl}
                        kind="primary"
                        size="sm"
                      >
                        🔑 Reclamar Certificado
                      </Button>
                    )}
                  </div>
                </Tile>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}