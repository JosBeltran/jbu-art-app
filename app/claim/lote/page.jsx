'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import ArtworkImage from '@/components/ArtworkImage'
import { useI18n, useLocalized } from '@/components/I18nProvider'
import { Button, InlineLoading, InlineNotification, Tag } from '@carbon/react'
import { Checkmark, Key } from '@carbon/icons-react'
import styles from '../Claim.module.css'

function ClaimLoteContent() {
  const { t, locale } = useI18n()
  const L = useLocalized()
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
      if (!token) { setLoading(false); return }
      const { data: group } = await supabase.from('claim_groups').select('*').eq('group_token', token).single()
      if (group) { setGroupData(group); const { data: groupItems } = await supabase.from('order_items').select(`*, artworks (*)`).eq('claim_group_id', group.id); if (groupItems) setItems(groupItems) }
      setLoading(false)
    }
    loadGroup()
  }, [token])

  const handleClaimAll = async () => {
    if (!user) { router.push(`/login?redirectTo=${encodeURIComponent(`/claim/lote?token=${token}`)}`); return }
    setClaiming(true)
    const itemIds = items.filter((item) => !item.is_claimed).map((item) => item.id)
    if (!itemIds.length) { setClaiming(false); return }
    const { error } = await supabase.from('order_items').update({ is_claimed: true, claimed_by_user_id: user.id, claimed_at: new Date().toISOString() }).in('id', itemIds)
    if (error) { alert(t('Error al reclamar las obras: ', 'Error claiming the artworks: ') + error.message); setClaiming(false) } else router.push('/collection?claimed=success')
  }

  if (loading) return <div className={styles.loading}><InlineLoading description={t('Cargando obras...', 'Loading artworks...')} /></div>
  if (!groupData) return <main className={styles.page}><div className={styles.error}><InlineNotification lowContrast kind="error" title={t('Lote no disponible', 'Lot not available')} subtitle={t('El enlace no existe o ya expiró.', 'The link does not exist or has expired.')} hideCloseButton /></div></main>
  const unclaimedItems = items.filter((item) => !item.is_claimed)

  return <main className={styles.page}><div className={styles.loteShell}>
    <header className={styles.loteHeader}><div><p className={styles.eyebrow}>{t('Colección especial · Estudio JBU', 'Special collection · JBU Studio')}</p><h1 className={styles.title}>{t('Hola,', 'Hello,')} {groupData.buyer_name}</h1></div><p className={styles.count}>{t(`${unclaimedItems.length} de ${items.length} por reclamar`, `${unclaimedItems.length} of ${items.length} to claim`)}</p></header>
    <div className={styles.items}>{items.map((item) => { const art = item.artworks; const image = art?.primary_image_url || art?.image_url || (Array.isArray(art?.images) ? art.images[0] : null); return <article className={styles.item} key={item.id}><div className={styles.imageWrap}><ArtworkImage title={item.title_snapshot} primaryUrl={image} sku={item.sku_snapshot} className={styles.image}/></div><div className={styles.itemBody}><p className={styles.sku}>{item.sku_snapshot}</p><h2 className={styles.itemTitle}>{item.title_snapshot}</h2>{item.unit_price_mxn && <p className={styles.price}>${Number(item.unit_price_mxn).toLocaleString(locale)} MXN</p>}<Tag type={item.is_claimed ? 'green' : 'blue'} size="sm">{item.is_claimed ? t('Certificado vinculado', 'Certificate linked') : t('Listo para reclamar', 'Ready to claim')}</Tag></div></article> })}</div>
    <footer className={styles.loteFooter}><p>{unclaimedItems.length ? t('Las obras se vincularán juntas a tu colección privada.', 'The artworks will be linked together to your private collection.') : t('Todas las obras de este pedido ya están en una colección.', 'All artworks in this order are already in a collection.')}</p>{unclaimedItems.length > 0 && <Button onClick={handleClaimAll} disabled={claiming} size="lg" renderIcon={user ? Checkmark : Key}>{claiming ? t('Vinculando obras...', 'Linking artworks...') : user ? t('Reclamar todas las obras', 'Claim all artworks') : t('Iniciar sesión para reclamar', 'Sign in to claim')}</Button>}</footer>
  </div></main>
}

export default function ClaimLotePage() { return <Suspense fallback={<div className={styles.suspense} />}><ClaimLoteContent /></Suspense> }
