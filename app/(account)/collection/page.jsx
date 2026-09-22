'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import ArtworkImage from '@/components/ArtworkImage'
import { ArrowRight, Certificate, DeliveryTruck, Image as ImageIcon } from '@carbon/icons-react'
import { Button, InlineLoading, Tab, TabList, TabPanel, TabPanels, Tabs, Tag } from '@carbon/react'
import styles from './Collection.module.css'

const statusTag = (status) => {
  if (status === 'DELIVERED') return { type: 'green', label: 'Entregado' }
  if (status === 'SHIPPED') return { type: 'blue', label: 'En camino' }
  return { type: 'gray', label: 'Pago recibido' }
}

const parseShipping = (value) => {
  if (!value || typeof value !== 'string') return value || {}
  try { return JSON.parse(value) } catch { return {} }
}

export default function CollectionPage() {
  const [artworks, setArtworks] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const router = useRouter()

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUser(session.user)
      const [{ data: profileData }, { data: userArtworks }, ordersResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
        supabase.from('artworks').select('*').or(`current_owner_id.eq.${session.user.id},pending_owner_id.eq.${session.user.id}`).order('created_at',{ascending:false}),
        session.user.email ? supabase.from('orders').select('*').eq('buyer_email',session.user.email).order('created_at',{ascending:false}) : Promise.resolve({data:[]})
      ])
      if (profileData) setProfile(profileData)
      setArtworks(userArtworks || [])
      setOrders(ordersResult.data || [])
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) return <div className={styles.loading}><InlineLoading description="Cargando colección personal..." /></div>
  const collectorName = profile?.full_name || user?.email?.split('@')[0] || 'Coleccionista'

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}><p className={styles.eyebrow}>Registro privado</p><h1 className={styles.title}>Colección de {collectorName}</h1><p className={styles.subtitle}>Obras vinculadas a tu cuenta, certificados de autenticidad y seguimiento de tus adquisiciones.</p></header>
    <Tabs>
      <TabList aria-label="Colección y compras" contained><Tab>Mis obras ({artworks.length})</Tab><Tab>Envíos y compras ({orders.length})</Tab></TabList>
      <TabPanels>
        <TabPanel className={styles.panel}>
          {artworks.length === 0 ? <div className={styles.empty}><ImageIcon size={40}/><h2>Aún no tienes obras vinculadas</h2><p>Si adquiriste una pieza física, usa el código incluido en su certificado para incorporarla a tu colección.</p><Button as={Link} href="/claim" renderIcon={ArrowRight}>Reclamar una obra</Button></div> :
          <div className={styles.grid}>{artworks.map(art => { const imageUrl=art.primary_image_url||art.image_url||art.image||(Array.isArray(art.images)?art.images[0]:null); const pending=art.ownership_status==='CLAIM_PENDING'||(art.pending_owner_id&&!art.current_owner_id); return <article className={styles.artwork} key={art.id}>
            <div className={styles.imageWrap}><ArtworkImage title={art.title} primaryUrl={imageUrl} sku={art.sku} className={styles.image} style={{width:'100%',height:'100%',objectFit:'contain'}}/><Tag className={styles.status} type={pending?'warm-gray':'green'} size="sm">{pending?'En revisión':'Propiedad verificada'}</Tag></div>
            <div className={styles.artworkBody}><div><p className={styles.sku}>{art.sku}</p><h2 className={styles.artworkTitle}>{art.title}</h2><p className={styles.medium}>{art.medium||art.technique||'Técnica mixta'}</p></div>{art.certificate_hash&&<div className={styles.hash}><p className={styles.hashLabel}>Huella del certificado SHA-256</p><p className={styles.hashValue} title={art.certificate_hash}>{art.certificate_hash}</p></div>}<Button className={styles.artworkAction} as={Link} href={`/verify/${encodeURIComponent(art.sku)}`} kind="secondary" renderIcon={Certificate}>Ver certificado y proveniencia</Button></div>
          </article>})}</div>}
        </TabPanel>
        <TabPanel className={styles.panel}>
          {orders.length===0 ? <div className={styles.empty}><DeliveryTruck size={40}/><h2>No tienes pedidos registrados</h2><p>Las compras realizadas con {user?.email} aparecerán aquí con su estado y guía de envío.</p></div> :
          <div className={styles.orders}>{orders.map(order=>{const shipping=parseShipping(order.shipping_address);const address=shipping?.address||shipping;const tag=statusTag(order.status);return <article className={styles.order} key={order.id}>
            <header className={styles.orderHeader}><div><p className={styles.orderId}>Orden #{order.id.substring(0,8).toUpperCase()}</p><p className={styles.date}>{new Date(order.created_at).toLocaleDateString('es-MX',{year:'numeric',month:'long',day:'numeric'})}</p></div><Tag type={tag.type} size="sm">{tag.label}</Tag></header>
            <div className={styles.orderBody}><div><p className={styles.detailLabel}>Comprador</p><p className={styles.detailValue}>{order.buyer_name}</p><p className={styles.detailValue}>{order.buyer_email}</p>{order.buyer_phone&&<p className={styles.detailValue}>{order.buyer_phone}</p>}</div><div><p className={styles.detailLabel}>Dirección de entrega</p><p className={styles.detailValue}>{address?.line1||'Dirección en archivo'}</p><p className={styles.detailValue}>{[address?.city,address?.state,address?.postal_code].filter(Boolean).join(', ')}</p></div></div>
            <footer className={styles.orderFooter}><Button as={Link} href={`/orders/${order.id}`} size="sm" renderIcon={ArrowRight}>Ver detalle y certificados</Button><p className={styles.total}>${Number(order.total_amount_mxn||0).toLocaleString('es-MX',{minimumFractionDigits:2})} MXN</p></footer>
          </article>})}</div>}
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div></main>
}
