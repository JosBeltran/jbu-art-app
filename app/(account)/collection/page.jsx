'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import ArtworkImage from '@/components/ArtworkImage'
import { useI18n, useLocalized } from '@/components/I18nProvider'
import { ArrowRight, Certificate, DeliveryTruck, Image as ImageIcon, TrashCan, Favorite } from '@carbon/icons-react'
import { Button, InlineLoading, Tab, TabList, TabPanel, TabPanels, Tabs, Tag } from '@carbon/react'
import styles from './Collection.module.css'

const statusTag = (status, t) => {
  if (status === 'DELIVERED') return { type: 'green', label: t('Entregado', 'Delivered') }
  if (status === 'SHIPPED') return { type: 'blue', label: t('En camino', 'Shipped') }
  return { type: 'gray', label: t('Pago recibido', 'Payment received') }
}

const parseShipping = (value) => {
  if (!value || typeof value !== 'string') return value || {}
  try { return JSON.parse(value) } catch { return {} }
}

const money = (value, locale) => `$${Number(value || 0).toLocaleString(locale)}`

export default function CollectionPage() {
  const { t, locale } = useI18n()
  const L = useLocalized()
  const [artworks, setArtworks] = useState([])
  const [orders, setOrders] = useState([])
  const [favorites, setFavorites] = useState([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [removingId, setRemovingId] = useState(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [selectedIndex, setSelectedIndex] = useState(tabParam === 'favorites' ? 2 : 0)

  useEffect(() => {
    if (tabParam === 'favorites') setSelectedIndex(2)
  }, [tabParam])

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUser(session.user)
      const [{ data: profileData }, { data: userArtworks }, ordersResult, favoritesResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
        supabase.from('artworks').select('*').or(`current_owner_id.eq.${session.user.id},pending_owner_id.eq.${session.user.id}`).order('created_at',{ascending:false}),
        session.user.email ? supabase.from('orders').select('*').eq('buyer_email',session.user.email).order('created_at',{ascending:false}) : Promise.resolve({data:[]}),
        supabase
          .from('artwork_favorites')
          .select('id, created_at, artworks(id, sku, title, title_en, primary_image_url, image_url, base_price_mxn, favorites_count)')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
      ])
      if (profileData) setProfile(profileData)
      setArtworks(userArtworks || [])
      setOrders(ordersResult.data || [])
      setFavorites((favoritesResult.data || []).filter((f) => f.artworks))
      setLoading(false)
    }
    load()
  }, [router])

  const handleRemoveFavorite = async (favoriteId, artworkId) => {
    if (!user?.id || removingId) return
    setRemovingId(favoriteId)
    const previous = favorites
    setFavorites((prev) => prev.filter((f) => f.id !== favoriteId))
    const { error } = await supabase
      .from('artwork_favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('artwork_id', artworkId)
    if (error) {
      setFavorites(previous)
    }
    setRemovingId(null)
  }

  if (loading) return <div className={styles.loading}><InlineLoading description={t('Cargando colección personal...', 'Loading personal collection...')} /></div>
  const collectorName = profile?.full_name || user?.email?.split('@')[0] || t('Coleccionista', 'Collector')

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}><p className={styles.eyebrow}>{t('Registro privado de arte', 'Private art registry')}</p><h1 className={styles.title}>{t('Colección de', 'Collection of')} {collectorName}</h1><p className={styles.subtitle}>{t('Obras vinculadas a tu cuenta, certificados de autenticidad y seguimiento de tus adquisiciones.', 'Artworks linked to your account, authenticity certificates and tracking of your purchases.')}</p></header>
    <Tabs selectedIndex={selectedIndex} onChange={({ selectedIndex: i }) => setSelectedIndex(i)}>
      <TabList aria-label={t('Colección y compras', 'Collection and purchases')}>
        <Tab>{t('Mis obras', 'My artworks')} ({artworks.length})</Tab>
        <Tab>{t('Envíos y compras', 'Shipments and purchases')} ({orders.length})</Tab>
        <Tab>{t('Favoritos', 'Favorites')} ({favorites.length})</Tab>
      </TabList>
      <TabPanels>
        <TabPanel className={styles.panel}>
          {artworks.length === 0 ? <div className={styles.empty}><ImageIcon size={40}/><h2>{t('Aún no tienes obras vinculadas', "You don't have linked artworks yet")}</h2><p>{t('Si adquiriste una pieza física, usa el código incluido en su certificado para incorporarla a tu colección.', 'If you purchased a physical piece, use the code included on its certificate to add it to your collection.')}</p><Button as={Link} href="/claim" renderIcon={ArrowRight}>{t('Reclamar una obra', 'Claim an artwork')}</Button></div> :
          <div className={styles.grid}>{artworks.map(art => { const imageUrl=art.primary_image_url||art.image_url||art.image||(Array.isArray(art.images)?art.images[0]:null); const pending=art.ownership_status==='CLAIM_PENDING'||(art.pending_owner_id&&!art.current_owner_id); return <article className={styles.artwork} key={art.id}>
            <div className={styles.imageWrap}><ArtworkImage title={L(art, 'title')} primaryUrl={imageUrl} sku={art.sku} className={styles.image} style={{width:'100%',height:'100%',objectFit:'contain'}}/><Tag className={styles.status} type={pending?'warm-gray':'green'} size="sm">{pending?t('En revisión', 'Under review'):t('Propiedad verificada', 'Verified ownership')}</Tag></div>
            <div className={styles.artworkBody}><div><h2 className={styles.artworkTitle}>{L(art, 'title')}</h2><p className={styles.medium}>{L(art, 'medium')||L(art, 'technique')||t('Técnica mixta', 'Mixed media')}</p></div><div className={styles.registry}><p className={styles.registryLabel}><Certificate size={14}/>{t('Certificado de autenticidad · Proveniencia', 'Certificate of authenticity · Provenance')}</p><dl className={styles.registryData}><div><dt>SKU</dt><dd>{art.sku}</dd></div>{art.certificate_hash&&<div><dt>{t('Huella SHA-256', 'SHA-256 fingerprint')}</dt><dd className={styles.hashValue} title={art.certificate_hash}>{art.certificate_hash}</dd></div>}</dl></div><Button className={styles.artworkAction} as={Link} href={`/verify/${encodeURIComponent(art.sku)}`} kind="ghost" size="sm" renderIcon={ArrowRight}>{t('Ver certificado y proveniencia', 'View certificate and provenance')}</Button></div>
          </article>})}</div>}
        </TabPanel>
        <TabPanel className={styles.panel}>
          {orders.length===0 ? <div className={styles.empty}><DeliveryTruck size={40}/><h2>{t('No tienes pedidos registrados', 'You have no registered orders')}</h2><p>{t(`Las compras realizadas con ${user?.email} aparecerán aquí con su estado y guía de envío.`, `Purchases made with ${user?.email} will appear here with their status and tracking number.`)}</p></div> :
          <div className={styles.orders}>{orders.map(order=>{const shipping=parseShipping(order.shipping_address);const address=shipping?.address||shipping;const tag=statusTag(order.status, t);return <article className={styles.order} key={order.id}>
            <header className={styles.orderHeader}><div><p className={styles.orderKicker}>{t('Adquisición', 'Acquisition')}</p><p className={styles.orderId}>{t('Orden', 'Order')} #{order.id.substring(0,8).toUpperCase()}</p><p className={styles.date}>{new Date(order.created_at).toLocaleDateString(locale,{year:'numeric',month:'long',day:'numeric'})}</p></div><Tag type={tag.type} size="sm">{tag.label}</Tag></header>
            <div className={styles.orderBody}><div><p className={styles.detailLabel}>{t('Comprador', 'Buyer')}</p><p className={styles.detailValue}>{order.buyer_name}</p><p className={styles.detailValue}>{order.buyer_email}</p>{order.buyer_phone&&<p className={styles.detailValue}>{order.buyer_phone}</p>}</div><div><p className={styles.detailLabel}>{t('Dirección de entrega', 'Delivery address')}</p><p className={styles.detailValue}>{address?.line1||t('Dirección en archivo', 'Address on file')}</p><p className={styles.detailValue}>{[address?.city,address?.state,address?.postal_code].filter(Boolean).join(', ')}</p></div></div>
            <footer className={styles.orderFooter}><Button as={Link} href={`/orders/${order.id}`} size="sm" renderIcon={ArrowRight}>{t('Ver detalle y certificados', 'View details and certificates')}</Button><p className={styles.total}>${Number(order.total_amount_mxn||0).toLocaleString(locale,{minimumFractionDigits:2})} MXN</p></footer>
          </article>})}</div>}
        </TabPanel>
        <TabPanel className={styles.panel}>
          {favorites.length === 0 ? <div className={styles.empty}><Favorite size={40}/><h2>{t('Aún no tienes favoritos', "You don't have favorites yet")}</h2><p>{t('Guarda las obras que más te gusten desde su ficha y aparecerán aquí.', 'Save the artworks you like the most from their detail page and they will appear here.')}</p><Button as={Link} href="/catalog" renderIcon={ArrowRight}>{t('Ver catálogo', 'View catalog')}</Button></div> :
          <div className={styles.grid}>{favorites.map(fav => { const art = fav.artworks; const imageUrl = art.primary_image_url || art.image_url; return <article className={styles.artwork} key={fav.id}>
            <Link href={`/artwork/${art.sku}`} className={styles.imageWrap}><ArtworkImage title={L(art, 'title')} primaryUrl={imageUrl} sku={art.sku} className={styles.image} style={{width:'100%',height:'100%',objectFit:'contain'}}/></Link>
            <div className={styles.artworkBody}>
              <div>
                <p className={styles.sku}>{art.sku}</p>
                <h2 className={styles.artworkTitle}><Link href={`/artwork/${art.sku}`}>{L(art, 'title')}</Link></h2>
                <p className={styles.medium}>{money(art.base_price_mxn, locale)} MXN</p>
              </div>
              <Button
                className={styles.artworkAction}
                kind="ghost"
                size="sm"
                renderIcon={TrashCan}
                disabled={removingId === fav.id}
                onClick={() => handleRemoveFavorite(fav.id, art.id)}
              >
                {t('Quitar de favoritos', 'Remove from favorites')}
              </Button>
            </div>
          </article>})}</div>}
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div></main>
}
