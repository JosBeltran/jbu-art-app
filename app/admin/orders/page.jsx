'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import { 
  Tile, 
  Button, 
  TextInput, 
  TextArea, 
  Select, 
  SelectItem, 
  InlineLoading, 
  Tag 
} from '@carbon/react'
import { Copy, ArrowLeft, Save, Launch, Checkmark, Warning } from '@carbon/icons-react'

export default function AdminOrdersPage() {
  const router = useRouter()

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [updatingId, setUpdatingId] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Estado temporal para los campos de edición por orden
  const [editForms, setEditForms] = useState({})

  useEffect(() => {
    const fetchOrders = async () => {
      setCheckingAuth(false)

      // Cargar Órdenes con sus Ítems
      const { data: ordersData, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            id,
            title_snapshot,
            sku_snapshot,
            unit_price_mxn,
            quantity,
            claim_token_snapshot
          )
        `)
        .order('created_at', { ascending: false })

      if (error) {
        setErrorMsg('Error al consultar las órdenes: ' + error.message)
      } else if (ordersData) {
        setOrders(ordersData)

        // Inicializar los formularios de edición rápida para cada orden
        const initialForms = {}
        ordersData.forEach((ord) => {
          initialForms[ord.id] = {
            status: ord.status || 'PAYMENT_RECEIVED',
            courier_name: ord.courier_name || '',
            tracking_number: ord.tracking_number || '',
            tracking_url: ord.tracking_url || '',
            notes: ord.notes || ''
          }
        })
        setEditForms(initialForms)
      }

      setLoading(false)
    }

    fetchOrders()
  }, [])

  const handleInputChange = (orderId, field, value) => {
    setEditForms((prev) => ({
      ...prev,
      [orderId]: {
        ...prev[orderId],
        [field]: value
      }
    }))
  }

  const handleSaveOrder = async (orderId) => {
    setUpdatingId(orderId)
    setSuccessMsg('')
    setErrorMsg('')

    const formData = editForms[orderId]

    const updatePayload = {
      status: formData.status,
      courier_name: formData.courier_name,
      tracking_number: formData.tracking_number,
      tracking_url: formData.tracking_url,
      notes: formData.notes,
      updated_at: new Date().toISOString()
    }

    if (formData.status === 'SHIPPED' && !orders.find(o => o.id === orderId)?.shipped_at) {
      updatePayload.shipped_at = new Date().toISOString()
    } else if (formData.status === 'DELIVERED' && !orders.find(o => o.id === orderId)?.delivered_at) {
      updatePayload.delivered_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId)

    if (error) {
      setErrorMsg(`Error al actualizar la orden #${orderId.slice(0, 8)}: ${error.message}`)
    } else {
      setSuccessMsg(`Orden #${orderId.slice(0, 8).toUpperCase()} actualizada con éxito.`)
      
      // Actualizar estado local
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, ...updatePayload } : o))
      )
    }

    setUpdatingId(null)
  }

  const copyAddressToClipboard = (address, name, phone) => {
    const formatted = `REMITENTE / DESTINATARIO:
Nombre: ${name}
Teléfono: ${phone || 'N/A'}
Dirección: ${address?.line1 || ''} ${address?.line2 || ''}
Ciudad/Municipio: ${address?.city || ''}
Estado: ${address?.state || ''}
CP: ${address?.postal_code || ''}
País: ${address?.country || ''}`

    navigator.clipboard.writeText(formatted)
    alert('📋 Dirección formateada copiada al portapapeles.')
  }

  const filteredOrders = orders.filter((o) => {
    if (filterStatus === 'ALL') return true
    return o.status === filterStatus
  })

  if (checkingAuth || loading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: 'var(--cds-background)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <InlineLoading description="Cargando gestión de órdenes y envíos..." />
      </div>
    )
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
        
        {/* ENCABEZADO */}
        <header style={{ borderBottom: '1px solid var(--cds-border-subtle)', paddingBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f1c21b', display: 'inline-block' }}></span>
              <span style={{ fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', letterSpacing: '0.1em', color: '#f1c21b', textTransform: 'uppercase' }}>
                Panel Administrativo — Estudio JBU
              </span>
            </div>
            <h1 style={{ fontSize: '1.75rem', fontFamily: 'serif', fontWeight: 300, color: 'var(--cds-text-primary)', margin: 0 }}>
              Gestión de Órdenes y Logística ({orders.length})
            </h1>
          </div>

          <Button
            as={Link}
            href="/admin/artworks"
            kind="tertiary"
            size="sm"
            renderIcon={ArrowLeft}
          >
            Volver a Inventario
          </Button>
        </header>

        {/* MENSAJES DE ALERTA */}
        {successMsg && (
          <Tile style={{ padding: '1rem', backgroundColor: 'rgba(36, 161, 72, 0.05)', border: '1px solid rgba(36, 161, 72, 0.3)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Checkmark style={{ fill: '#42be65', flexShrink: 0 }} />
            <span style={{ fontSize: '0.8rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: '#42be65' }}>
              {successMsg}
            </span>
          </Tile>
        )}

        {errorMsg && (
          <Tile style={{ padding: '1rem', backgroundColor: 'rgba(da, 30, 39, 0.05)', border: '1px solid rgba(da, 30, 39, 0.3)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Warning style={{ fill: '#da1e28', flexShrink: 0 }} />
            <span style={{ fontSize: '0.8rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: '#da1e28' }}>
              {errorMsg}
            </span>
          </Tile>
        )}

        {/* FILTROS POR ESTATUS */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {[
            { id: 'ALL', label: 'Todas' },
            { id: 'PAYMENT_RECEIVED', label: '📦 Pago Confirmado' },
            { id: 'PROCESSING', label: '🛠️ En Empaque' },
            { id: 'SHIPPED', label: '🚚 Enviadas' },
            { id: 'DELIVERED', label: '✅ Entregadas' }
          ].map((tab) => {
            const isActive = filterStatus === tab.id
            return (
              <Button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id)}
                kind={isActive ? 'primary' : 'secondary'}
                size="sm"
                style={{
                  backgroundColor: isActive ? '#f1c21b' : 'var(--cds-layer-01)',
                  color: isActive ? '#161616' : 'var(--cds-text-secondary)',
                  border: '1px solid',
                  borderColor: isActive ? '#f1c21b' : 'var(--cds-border-subtle)'
                }}
              >
                {tab.label}
              </Button>
            )
          })}
        </div>

        {/* LISTADO DE ÓRDENES */}
        {filteredOrders.length === 0 ? (
          <Tile style={{ padding: '3rem', textAlign: 'center', backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)' }}>
            <p style={{ fontSize: '0.8rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)', margin: 0 }}>
              No hay órdenes registradas con el filtro seleccionado.
            </p>
          </Tile>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {filteredOrders.map((order) => {
              const form = editForms[order.id] || {}
              const isSaving = updatingId === order.id

              return (
                <Tile
                  key={order.id}
                  style={{
                    backgroundColor: 'var(--cds-layer-01)',
                    border: '1px solid var(--cds-border-subtle)',
                    padding: '1.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.5rem'
                  }}
                >
                  {/* CABECERA DE LA ORDEN */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--cds-border-subtle)', paddingBottom: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.85rem', fontFamily: 'var(--cds-code-font-family, monospace)', fontWeight: 'bold', color: '#f1c21b' }}>
                          ID: #{order.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span style={{ fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-helper)' }}>
                          {new Date(order.created_at).toLocaleString('es-MX')}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--cds-text-secondary)', margin: 0 }}>
                        Comprador: <strong style={{ color: 'var(--cds-text-primary)' }}>{order.buyer_name}</strong> ({order.buyer_email})
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.9rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: '#f1c21b', fontWeight: 'bold' }}>
                        ${order.total_amount_mxn?.toLocaleString('es-MX')} MXN
                      </span>
                      <Button
                        as={Link}
                        href={`/orders/${order.id}`}
                        target="_blank"
                        kind="ghost"
                        size="sm"
                        renderIcon={Launch}
                      >
                        Ver Vista del Cliente
                      </Button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                    
                    {/* COLUMNA IZQUIERDA: DIRECCIÓN Y PIEZAS */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      
                      {/* DIRECCIÓN DE ENVÍO */}
                      <div style={{ backgroundColor: 'var(--cds-layer-02)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--cds-border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            📍 Dirección de Destino
                          </span>
                          <Button
                            onClick={() => copyAddressToClipboard(order.shipping_address, order.buyer_name, order.buyer_phone)}
                            kind="ghost"
                            size="sm"
                            renderIcon={Copy}
                          >
                            Copiar Dirección
                          </Button>
                        </div>

                        <div style={{ fontSize: '0.75rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem', lineHeight: 1.5 }}>
                          <p style={{ fontWeight: 'bold', color: 'var(--cds-text-primary)', margin: 0 }}>{order.buyer_name}</p>
                          <p style={{ margin: 0 }}>{order.shipping_address?.line1} {order.shipping_address?.line2}</p>
                          <p style={{ margin: 0 }}>{order.shipping_address?.city}, {order.shipping_address?.state} CP {order.shipping_address?.postal_code}</p>
                          <p style={{ color: 'var(--cds-text-helper)', margin: 0 }}>{order.shipping_address?.country}</p>
                          {order.buyer_phone && <p style={{ color: '#f1c21b', margin: '0.25rem 0 0 0' }}>Tel: {order.buyer_phone}</p>}
                        </div>
                      </div>

                      {/* ÍTEMS EN LA ORDEN */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          🖼️ Piezas en el Pedido ({order.order_items?.length || 0})
                        </span>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {order.order_items?.map((item) => (
                            <div
                              key={item.id}
                              style={{
                                backgroundColor: 'var(--cds-layer-02)',
                                padding: '0.75rem',
                                borderRadius: '4px',
                                border: '1px solid var(--cds-border-subtle)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: '0.75rem',
                                fontFamily: 'var(--cds-code-font-family, monospace)'
                              }}
                            >
                              <div style={{ display: 'flex', gap: '0.5rem', minWidth: 0 }}>
                                <span style={{ color: '#f1c21b', fontWeight: 'bold' }}>[{item.sku_snapshot}]</span>
                                <span style={{ color: 'var(--cds-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title_snapshot}</span>
                              </div>
                              <span style={{ color: 'var(--cds-text-secondary)', flexShrink: 0 }}>${item.unit_price_mxn?.toLocaleString('es-MX')} MXN</span>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>

                    {/* COLUMNA DERECHA: FORMULARIO DE EDICIÓN DE ENVÍO */}
                    <div style={{ backgroundColor: 'var(--cds-layer-02)', padding: '1.25rem', borderRadius: '4px', border: '1px solid var(--cds-border-subtle)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <span style={{ fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: '#f1c21b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        ⚙️ Actualizar Estado y Rastreo
                      </span>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                        <Select
                          id={`status-${order.id}`}
                          labelText="Estatus del Envío"
                          value={form.status}
                          onChange={(e) => handleInputChange(order.id, 'status', e.target.value)}
                        >
                          <SelectItem value="PAYMENT_RECEIVED" text="PAYMENT_RECEIVED (Pago Recibido)" />
                          <SelectItem value="PROCESSING" text="PROCESSING (En Empaque)" />
                          <SelectItem value="SHIPPED" text="SHIPPED (Enviado / Guía Generada)" />
                          <SelectItem value="DELIVERED" text="DELIVERED (Entregado)" />
                          <SelectItem value="CANCELLED" text="CANCELLED (Cancelado)" />
                        </Select>

                        <TextInput
                          id={`courier-${order.id}`}
                          labelText="Paquetería"
                          placeholder="Ej. DHL, FedEx, Estafeta"
                          value={form.courier_name}
                          onChange={(e) => handleInputChange(order.id, 'courier_name', e.target.value)}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                        <TextInput
                          id={`tracking-${order.id}`}
                          labelText="Número de Guía / Tracking"
                          placeholder="Ej. 1234567890"
                          value={form.tracking_number}
                          onChange={(e) => handleInputChange(order.id, 'tracking_number', e.target.value)}
                        />

                        <TextInput
                          id={`url-${order.id}`}
                          labelText="URL Directa de Rastreo"
                          placeholder="https://dhl.com/track/..."
                          value={form.tracking_url}
                          onChange={(e) => handleInputChange(order.id, 'tracking_url', e.target.value)}
                        />
                      </div>

                      <TextArea
                        id={`notes-${order.id}`}
                        labelText="Notas Internas de Empaque"
                        rows={2}
                        placeholder="Ej. Caja reforzada con esquineros, incluir certificado impreso..."
                        value={form.notes}
                        onChange={(e) => handleInputChange(order.id, 'notes', e.target.value)}
                      />

                      <Button
                        onClick={() => handleSaveOrder(order.id)}
                        disabled={isSaving}
                        kind="primary"
                        size="md"
                        renderIcon={Save}
                        style={{ width: '100%', justifyContent: 'center' }}
                      >
                        {isSaving ? 'Guardando Cambios...' : 'Guardar Cambios de la Orden'}
                      </Button>
                    </div>

                  </div>
                </Tile>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}