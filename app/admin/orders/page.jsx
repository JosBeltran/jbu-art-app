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
  InlineNotification,
  Tabs,
  TabList,
  Tab,
  Tag,
} from '@carbon/react'
import { Copy, ArrowLeft, Save, Launch } from '@carbon/icons-react'
import styles from './Orders.module.css'

const STATUS_TABS = [
  { id: 'ALL', label: 'Todas' },
  { id: 'PAYMENT_RECEIVED', label: 'Pago confirmado' },
  { id: 'PROCESSING', label: 'En empaque' },
  { id: 'SHIPPED', label: 'Enviadas' },
  { id: 'DELIVERED', label: 'Entregadas' },
]

const STATUS_TAG_TYPE = {
  PAYMENT_RECEIVED: 'blue',
  PROCESSING: 'purple',
  SHIPPED: 'teal',
  DELIVERED: 'green',
  CANCELLED: 'red',
}

export default function AdminOrdersPage() {
  const router = useRouter()

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [updatingId, setUpdatingId] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
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

  const copyAddressToClipboard = (order) => {
    const address = order.shipping_address
    const formatted = `REMITENTE / DESTINATARIO:
Nombre: ${order.buyer_name}
Teléfono: ${order.buyer_phone || 'N/A'}
Dirección: ${address?.line1 || ''} ${address?.line2 || ''}
Ciudad/Municipio: ${address?.city || ''}
Estado: ${address?.state || ''}
CP: ${address?.postal_code || ''}
País: ${address?.country || ''}`

    navigator.clipboard.writeText(formatted)
    setCopiedId(order.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const filteredOrders = orders.filter((o) => {
    if (filterStatus === 'ALL') return true
    return o.status === filterStatus
  })

  if (checkingAuth || loading) {
    return (
      <div className={styles.loading}>
        <InlineLoading description="Cargando gestión de órdenes y envíos..." />
      </div>
    )
  }

  return (
    <div className={styles.shell}>
      <div className={styles.inner}>

        {/* ENCABEZADO */}
        <header className={styles.header}>
          <div className={styles.headerInfo}>
            <p className={styles.kicker}>Panel Administrativo — Estudio JBU</p>
            <h1 className={styles.title}>
              Órdenes y Logística ({orders.length})
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
          <InlineNotification
            kind="success"
            title="Orden actualizada"
            subtitle={successMsg}
            lowContrast
            onCloseButtonClick={() => setSuccessMsg('')}
          />
        )}

        {errorMsg && (
          <InlineNotification
            kind="error"
            title="Error de sistema"
            subtitle={errorMsg}
            lowContrast
            onCloseButtonClick={() => setErrorMsg('')}
          />
        )}

        {/* FILTROS POR ESTATUS */}
        <div className={styles.filters}>
          <Tabs
            selectedIndex={STATUS_TABS.findIndex((t) => t.id === filterStatus)}
            onChange={({ selectedIndex }) => setFilterStatus(STATUS_TABS[selectedIndex].id)}
          >
            <TabList aria-label="Filtrar órdenes por estatus" contained>
              {STATUS_TABS.map((tab) => (
                <Tab key={tab.id}>{tab.label}</Tab>
              ))}
            </TabList>
          </Tabs>
        </div>

        {/* LISTADO DE ÓRDENES */}
        {filteredOrders.length === 0 ? (
          <Tile className={styles.empty}>
            <p>No hay órdenes registradas con el filtro seleccionado.</p>
          </Tile>
        ) : (
          <div className={styles.list}>
            {filteredOrders.map((order) => {
              const form = editForms[order.id] || {}
              const isSaving = updatingId === order.id

              return (
                <Tile key={order.id} className={styles.orderCard}>
                  {/* CABECERA DE LA ORDEN */}
                  <div className={styles.orderHead}>
                    <div className={styles.orderMeta}>
                      <div className={styles.orderIdRow}>
                        <span className={styles.orderId}>
                          #{order.id.slice(0, 8).toUpperCase()}
                        </span>
                        <Tag type={STATUS_TAG_TYPE[order.status] || 'cool-gray'} size="sm">
                          {order.status || 'PAYMENT_RECEIVED'}
                        </Tag>
                        <span className={styles.orderDate}>
                          {new Date(order.created_at).toLocaleString('es-MX')}
                        </span>
                      </div>
                      <p className={styles.buyer}>
                        Comprador: <strong>{order.buyer_name}</strong> ({order.buyer_email})
                      </p>
                    </div>

                    <div className={styles.orderActions}>
                      <span className={styles.orderTotal}>
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

                  <div className={styles.columns}>

                    {/* COLUMNA IZQUIERDA: DIRECCIÓN Y PIEZAS */}
                    <div className={styles.column}>

                      {/* DIRECCIÓN DE ENVÍO */}
                      <div className={styles.panel}>
                        <div className={styles.panelHead}>
                          <span className={styles.panelLabel}>Dirección de destino</span>
                          <Button
                            onClick={() => copyAddressToClipboard(order)}
                            kind="ghost"
                            size="sm"
                            renderIcon={Copy}
                          >
                            {copiedId === order.id ? '¡Copiada!' : 'Copiar Dirección'}
                          </Button>
                        </div>

                        <div className={styles.address}>
                          <p className={styles.addressName}>{order.buyer_name}</p>
                          <p>{order.shipping_address?.line1} {order.shipping_address?.line2}</p>
                          <p>{order.shipping_address?.city}, {order.shipping_address?.state} CP {order.shipping_address?.postal_code}</p>
                          <p>{order.shipping_address?.country}</p>
                          {order.buyer_phone && (
                            <p className={styles.addressPhone}>Tel: {order.buyer_phone}</p>
                          )}
                        </div>
                      </div>

                      {/* ÍTEMS EN LA ORDEN */}
                      <div className={styles.column} style={{ gap: '0.5rem' }}>
                        <span className={styles.panelLabel}>
                          Piezas en el pedido ({order.order_items?.length || 0})
                        </span>

                        <div className={styles.itemsList}>
                          {order.order_items?.map((item) => (
                            <div key={item.id} className={styles.item}>
                              <div className={styles.itemInfo}>
                                <span className={styles.itemSku}>[{item.sku_snapshot}]</span>
                                <span className={styles.itemTitle}>{item.title_snapshot}</span>
                              </div>
                              <span className={styles.itemPrice}>
                                ${item.unit_price_mxn?.toLocaleString('es-MX')} MXN
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>

                    {/* COLUMNA DERECHA: FORMULARIO DE EDICIÓN DE ENVÍO */}
                    <div className={styles.form}>
                      <span className={styles.panelLabelAccent}>
                        Actualizar estado y rastreo
                      </span>

                      <div className={styles.formGrid}>
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

                      <div className={styles.formGrid}>
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
                        className={styles.saveButton}
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
