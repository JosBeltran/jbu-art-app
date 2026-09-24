'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import ArtworkImage from '@/components/ArtworkImage'
import { useI18n } from '@/components/I18nProvider'
import { Button, InlineLoading, InlineNotification, Tag } from '@carbon/react'
import { Checkmark, Key } from '@carbon/icons-react'
import styles from '../Claim.module.css'

function ClaimLoteContent() {
  const { t, locale } = useI18n()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const router = useRouter()
  const [groupData, setGroupData] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [user, setUser] = useState(null)

  const returnPath = `/claim/lote?token=${encodeURIComponent(token || '')}`
  const loginHref = `/login?next=${encodeURIComponent(returnPath)}&redirectTo=${encodeURIComponent(returnPath)}`

  useEffect(() => {
    let active = true
    async function load() {
      if (!token) { setLoading(false); return }
      const { data: sessionData } = await supabase.auth.getSession()
      const currentUser = sessionData?.session?.user || null
      if (!active) return
      setUser(currentUser)
      const { data: group } = await supabase.from('claim_groups').select('*').eq('group_token', token).maybeSingle()
      if (!active) return
      if (group) {
        setGroupData(group)
        const { data: groupItems } = await supabase.from('order_items').select('*, artworks (*)').eq('claim_group_id', group.id)
        if (active && groupItems) setItems(groupItems)
      }
      if (active) setLoading(false)
    }
    load()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => { if (active) setUser(session?.user || null) })
    return () => { active = false; sub?.subscription?.unsubscribe() }
  }, [token])

  const handleClaimAll = async () => {
    if (!user) { router.push(loginHref); return }
    setClaiming(true)
    const itemIds = items.filter((item) => !item.is_claimed).map((item) => item.id)
    if (!itemIds.length) { setClaiming(false); return }
    const { error } = await supabase.from('order_items').update({ is_claimed: true, claimed_by_user_id: user.id, claimed_at: new Date().toISOString() }).in('id', itemIds)
    if (error) { alert(t('Error al reclamar las obras: ', 'Error claiming the artworks: ') + error.message); setClaiming(false) } else router.push('/collection?claimed=success')
  }

  if (loading) return <div className={styles.loading}><InlineLoading description={t('Cargando obras...', 'Loading artworks...')} /></div>

  if (!user && (!groupData || items.length === 0)) {
    return <main className={styles.page}><div className={styles.loteShell}>
      <header className={styles.loteHeader}><div><p className={styles.eyebrow}>{t('Colección especial · Estudio JBU', 'Special collection · JBU Studio')}</p><h1 className={styles.title}>{groupData?.buyer_name ? `${t('Hola,', 'Hello,')} ${groupData.buyer_name}` : t('Tus obras te esperan', 'Your artworks are waiting')}</h1></div></header>
      <footer className={styles.loteFooter}><p>{t('Inicia sesión o crea tu cuenta para ver y reclamar los certificados de este pedido.', 'Sign in or create your account to view and claim the certificates in this order.')}</p><Button onClick={() => router.push(loginHref)} size="lg" renderIcon={Key}>{t('Iniciar sesión para reclamar', 'Sign in to claim')}</Button></footer>
    </div></main>
  }

  if (!groupData) return <main className={styles.page}><div className={styles.error}><InlineNotification lowContrast kind="error" title={t('Lote no disponible', 'Lot not available')} subtitle={t('El enlace no existe o ya expiró.', 'The link does not exist or has expired.')} hideCloseButton /></div></main>

  const unclaimedItems = items.filter((item) => !item.is_claimed)
  const footerText = items.length === 0
    ? t('No encontramos obras disponibles en este enlace. Contacta al estudio si crees que es un error.', 'We could not find artworks for this link. Contact the studio if you think this is a mistake.')
    : unclaimedItems.length
      ? t('Las obras se vincularán juntas a tu colección privada.', 'The artworks will be linked together to your private collection.')
      : t('Todas las obras de este pedido ya están en una colección.', 'All artworks in this order are already in a collection.')

  return <main className={styles.page}><div className={styles.loteShell}>
    <header className={styles.loteHeader}><div><p className={styles.eyebrow}>{t('Colección especial · Estudio JBU', 'Special collection · JBU Studio')}</p><h1 className={styles.title}>{t('Hola,', 'Hello,')} {groupData.buyer_name}</h1></div>{items.length > 0 && <p className={styles.count}>{t(`${unclaimedItems.length} de ${items.length} por reclamar`, `${unclaimedItems.length} of ${items.length} to claim`)}</p>}</header>
    <div className={styles.items}>{items.map((item) => { const art = item.artworks; const image = art?.primary_image_url || art?.image_url || (Array.isArray(art?.images) ? art.images[0] : null); return <article className={styles.item} key={item.id}><div className={styles.imageWrap}><ArtworkImage title={item.title_snapshot} primaryUrl={image} sku={item.sku_snapshot} className={styles.image}/></div><div className={styles.itemBody}><p className={styles.sku}>{item.sku_snapshot}</p><h2 className={styles.itemTitle}>{item.title_snapshot}</h2>{item.unit_price_mxn && <p className={styles.price}>${Number(item.unit_price_mxn).toLocaleString(locale)} MXN</p>}<Tag type={item.is_claimed ? 'green' : 'blue'} size="sm">{item.is_claimed ? t('Certificado vinculado', 'Certificate linked') : t('Listo para reclamar', 'Ready to claim')}</Tag></div></article> })}</div>
    <footer className={styles.loteFooter}><p>{footerText}</p>{unclaimedItems.length > 0 && <Button onClick={handleClaimAll} disabled={claiming} size="lg" renderIcon={user ? Checkmark : Key}>{claiming ? t('Vinculando obras...', 'Linking artworks...') : user ? t('Reclamar todas las obras', 'Claim all artworks') : t('Iniciar sesión para reclamar', 'Sign in to claim')}</Button>}</footer>
  </div></main>
}

export default function ClaimLotePage() { return <Suspense fallback={<div className={styles.suspense} />}><ClaimLoteContent /></Suspense> }
