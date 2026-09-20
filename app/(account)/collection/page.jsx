'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import ArtworkImage from '@/components/ArtworkImage'
import { 
  Tile, 
  Button, 
  Tabs, 
  TabList, 
  Tab, 
  TabPanels, 
  TabPanel, 
  InlineLoading 
} from '@carbon/react'
import { ArrowRight, Image as ImageIcon, DeliveryTruck, Checkmark, View } from '@carbon/icons-react'

export default function CollectionPage() {
  const [activeTab, setActiveTab] = useState(0) // 0: artworks, 1: orders
  const [artworks, setArtworks] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)

  const router = useRouter()

  useEffect(() => {
    const fetchUserDataAndCollection = async () => {
      setLoading(true)

      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      setUser(session.user)

      // 1. Obtener Perfil
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle()

      if (profileData) {
        setProfile(profileData)
      }

      // 2. Consulta de obras pertenecientes al usuario
      const { data: userArtworks } = await supabase
        .from('artworks')
        .select('*')
        .or(`current_owner_id.eq.${session.user.id},pending_owner_id.eq.${session.user.id}`)
        .order('created_at', { ascending: false })

      if (userArtworks) {
        setArtworks(userArtworks)
      }

      // 3. Consulta de órdenes / compras realizadas por el usuario usando buyer_email
      if (session.user?.email) {
        const { data: userOrders, error: ordersError } = await supabase
          .from('orders')
          .select('*')
          .eq('buyer_email', session.user.email)
          .order('created_at', { ascending: false })

        if (ordersError) {
          console.error('Error al obtener órdenes:', ordersError)
        } else if (userOrders) {
          setOrders(userOrders)
        }
      }
      setLoading(false)
    }

    fetchUserDataAndCollection()
  }, [router])

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: 'var(--cds-background)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <InlineLoading description="Cargando colección personal..." />
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--cds-background)',
      color: 'var(--cds-text-primary)',
      padding: '2rem 1.5rem',
      boxSizing: 'border-box'
    }}>
      <div style={{ maxWidth: '72rem', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

        {/* ENCABEZADO Y TABS DE CARBON */}
        <header style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          borderBottom: '1px solid var(--cds-border-subtle)',
          paddingBottom: '1.5rem'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-link-primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Registro Privado
            </span>
            <h1 style={{ fontSize: '1.75rem', fontFamily: 'serif', fontWeight: 300, color: 'var(--cds-text-primary)', margin: 0 }}>
              Colección de {profile?.full_name || user?.email?.split('@')[0] || 'Coleccionista'}
            </h1>
          </div>

          <Tabs selectedIndex={activeTab} onChange={({ selectedIndex }) => setActiveTab(selectedIndex)}>
            <TabList aria-label="Opciones de colección" contained>
              <Tab>Mis Obras ({artworks.length})</Tab>
              <Tab>Envíos y Compras ({orders.length})</Tab>
            </TabList>
          </Tabs>
        </header>

        {/* CONTENIDO DE PESTAÑAS */}
        <Tabs selectedIndex={activeTab} onChange={() => {}}>
          <TabPanels>
            
            {/* PESTAÑA 1: SECCIÓN DE OBRAS */}
            <TabPanel>
              {artworks.length === 0 ? (
                <Tile style={{ padding: '3rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', backgroundColor: 'var(--cds-layer-01)' }}>
                  <p style={{ fontSize: '0.875rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)' }}>
                    Aún no tienes obras vinculadas a tu cuenta.
                  </p>
                  <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-helper)', maxWidth: '28rem', margin: 0 }}>
                    Si adquiriste una pieza física, escanea el código QR en el certificado o ingresa el código de reclamación.
                  </p>
                  <Button as={Link} href="/claim" kind="primary" size="sm">
                    Reclamar Nueva Obra
                  </Button>
                </Tile>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(20rem, 1fr))', gap: '1.5rem' }}>
                  {artworks.map((art) => {
                    const imageUrl = art.primary_image_url || art.image_url || art.image || (Array.isArray(art.images) ? art.images[0] : null)
                    const isPending = art.ownership_status === 'CLAIM_PENDING' || (art.pending_owner_id && !art.current_owner_id)

                    return (
                      <Tile key={art.id} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'between', padding: 0, overflow: 'hidden', backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)' }}>
                        <div>
                          {/* VISUALIZACIÓN / FOTO */}
                          <div style={{ height: '16rem', width: '100%', position: 'relative', backgroundColor: 'var(--cds-layer-02)' }}>
                            <ArtworkImage 
                              title={art.title}
                              primaryUrl={imageUrl}
                              sku={art.sku}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />

                            {/* ESTATUS DE VERIFICACIÓN */}
                            <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', zIndex: 10 }}>
                              {isPending ? (
                                <span style={{ padding: '0.25rem 0.625rem', backgroundColor: 'rgba(38, 38, 38, 0.85)', border: '1px solid #f1c21b', color: '#f1c21b', fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', borderRadius: '1rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                  <span style={{ width: '0.375rem', height: '0.375rem', borderRadius: '50%', backgroundColor: '#f1c21b' }}></span>
                                  En Revisión
                                </span>
                              ) : (
                                <span style={{ padding: '0.25rem 0.625rem', backgroundColor: 'rgba(38, 38, 38, 0.85)', border: '1px solid #24a148', color: '#42be65', fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', borderRadius: '1rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                  <span style={{ width: '0.375rem', height: '0.375rem', borderRadius: '50%', backgroundColor: '#42be65' }}></span>
                                  Verificada
                                </span>
                              )}
                            </div>
                          </div>

                          {/* INFORMACIÓN DE LA OBRA */}
                          <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div>
                              <p style={{ fontSize: '0.75rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-link-primary)', fontWeight: 600, margin: '0 0 0.25rem 0' }}>{art.sku}</p>
                              <h3 style={{ fontSize: '1.125rem', fontFamily: 'serif', fontWeight: 500, color: 'var(--cds-text-primary)', margin: '0 0 0.25rem 0' }}>{art.title}</h3>
                              <p style={{ fontSize: '0.8rem', color: 'var(--cds-text-secondary)', margin: 0 }}>{art.medium || art.technique || 'Técnica Mixta'}</p>
                            </div>

                            {art.certificate_hash && (
                              <div style={{ backgroundColor: 'var(--cds-layer-02)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--cds-border-subtle)', fontFamily: 'var(--cds-code-font-family, monospace)', fontSize: '0.7rem' }}>
                                <p style={{ color: 'var(--cds-text-helper)', textTransform: 'uppercase', margin: '0 0 0.2rem 0' }}>Hash SHA-256:</p>
                                <p style={{ color: 'var(--cds-text-secondary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={art.certificate_hash}>
                                  {art.certificate_hash}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* BOTÓN DE ACCIÓN */}
                        <div style={{ padding: '0 1.25rem 1.25rem 1.25rem' }}>
                          <Button 
                            as={Link} 
                            href={`/verify/${encodeURIComponent(art.sku)}`} 
                            kind="secondary" 
                            size="sm" 
                            renderIcon={ArrowRight}
                            style={{ width: '100%', justifyContent: 'space-between' }}
                          >
                            Ver Certificado y Proveniencia
                          </Button>
                        </div>
                      </Tile>
                    )
                  })}
                </div>
              )}
            </TabPanel>

            {/* PESTAÑA 2: SECCIÓN DE ENVÍOS Y COMPRAS */}
            <TabPanel>
              {orders.length === 0 ? (
                <Tile style={{ padding: '3rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', backgroundColor: 'var(--cds-layer-01)' }}>
                  <p style={{ fontSize: '0.875rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)' }}>
                    No tienes pedidos registrados con el correo {user?.email}.
                  </p>
                  <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-helper)', maxWidth: '28rem', margin: 0 }}>
                    Las obras adquiridas con este correo aparecerán aquí con su estado de empaque y guía de rastreo.
                  </p>
                </Tile>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {orders.map((order) => {
                    const orderDate = new Date(order.created_at).toLocaleDateString('es-MX', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })

                    const shipping = typeof order.shipping_address === 'string' 
                      ? JSON.parse(order.shipping_address) 
                      : order.shipping_address

                    return (
                      <Tile key={order.id} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem', backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)' }}>
                        
                        {/* ENCABEZADO DEL PEDIDO */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'between', alignItems: 'center', borderBottom: '1px solid var(--cds-border-subtle)', paddingBottom: '1rem', gap: '0.75rem' }}>
                          <div>
                            <p style={{ fontSize: '0.75rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-link-primary)', textTransform: 'uppercase', margin: '0 0 0.15rem 0' }}>
                              Orden #{order.id.substring(0, 8)}
                            </p>
                            <p style={{ fontSize: '0.8rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)', margin: 0 }}>{orderDate}</p>
                          </div>

                          <div>
                            <span style={{ 
                              padding: '0.25rem 0.75rem', 
                              fontSize: '0.7rem', 
                              fontFamily: 'var(--cds-code-font-family, monospace)', 
                              borderRadius: '1rem', 
                              border: '1px solid',
                              display: 'inline-block',
                              ...(order.status === 'DELIVERED' 
                                ? { backgroundColor: 'rgba(36, 161, 72, 0.1)', color: '#42be65', borderColor: 'rgba(36, 161, 72, 0.3)' } 
                                : order.status === 'SHIPPED' 
                                ? { backgroundColor: 'rgba(241, 194, 27, 0.1)', color: '#f1c21b', borderColor: 'rgba(241, 194, 27, 0.3)' } 
                                : { backgroundColor: 'var(--cds-layer-02)', color: 'var(--cds-text-secondary)', borderColor: 'var(--cds-border-subtle)' })
                            }}>
                              {order.status === 'SHIPPED' ? '🚚 En Camino' : order.status === 'DELIVERED' ? '✅ Entregado' : '📦 Pago Recibido'}
                            </span>
                          </div>
                        </div>

                        {/* DETALLE DE COMPRADOR Y DIRECCIÓN */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))', gap: '1rem', fontSize: '0.8rem', fontFamily: 'var(--cds-code-font-family, monospace)', backgroundColor: 'var(--cds-layer-02)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--cds-border-subtle)' }}>
                          <div>
                            <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--cds-text-helper)', margin: '0 0 0.25rem 0' }}>Comprador:</p>
                            <p style={{ color: 'var(--cds-text-primary)', fontWeight: 600, margin: '0 0 0.15rem 0' }}>{order.buyer_name}</p>
                            <p style={{ color: 'var(--cds-text-secondary)', margin: '0 0 0.15rem 0' }}>{order.buyer_email}</p>
                            {order.buyer_phone && <p style={{ color: 'var(--cds-text-helper)', margin: 0 }}>{order.buyer_phone}</p>}
                          </div>
                          <div>
                            <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--cds-text-helper)', margin: '0 0 0.25rem 0' }}>Dirección de Entrega:</p>
                            <p style={{ color: 'var(--cds-text-secondary)', margin: '0 0 0.15rem 0' }}>
                              {shipping?.line1 || shipping?.address?.line1 || 'Dirección en archivo'}
                            </p>
                            <p style={{ color: 'var(--cds-text-helper)', margin: 0 }}>
                              {shipping?.city || shipping?.address?.city}, {shipping?.state || shipping?.address?.state} {shipping?.postal_code || shipping?.address?.postal_code}
                            </p>
                          </div>
                        </div>

                        {/* BOTÓN DE ACCIÓN Y TOTAL */}
                        <div style={{ paddingTop: '0.5rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--cds-border-subtle)', gap: '1rem' }}>
                          <Button 
                            as={Link} 
                            href={`/orders/${order.id}`} 
                            kind="primary" 
                            size="sm"
                            renderIcon={ArrowRight}
                          >
                            Ver Detalle y Reclamar Certificados
                          </Button>

                          <div style={{ fontSize: '0.875rem', fontFamily: 'var(--cds-code-font-family, monospace)' }}>
                            <span style={{ color: 'var(--cds-text-secondary)' }}>Total Pago: </span>
                            <span style={{ color: 'var(--cds-link-primary)', fontWeight: 'bold' }}>
                              ${Number(order.total_amount_mxn).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                            </span>
                          </div>
                        </div>

                      </Tile>
                    )
                  })}
                </div>
              )}
            </TabPanel>

          </TabPanels>
        </Tabs>

      </div>
    </div>
  )
}