'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { getUserLevelInfo } from '@/lib/userLevels'
import { useI18n } from '@/components/I18nProvider'
import { ArrowRight, Image as ImageIcon, Package, Rocket } from '@carbon/icons-react'
import { Button, ClickableTile, InlineLoading, ProgressBar, Tab, TabList, TabPanel, TabPanels, Tabs, Tag } from '@carbon/react'
import styles from './Profile.module.css'

const orderTag = (status, t) => {
  if (status === 'DELIVERED') return { type: 'green', text: t('Entregado', 'Delivered') }
  if (status === 'SHIPPED') return { type: 'blue', text: t('En camino', 'Shipped') }
  return { type: 'gray', text: t('Pago confirmado', 'Payment confirmed') }
}

export default function ProfilePage() {
  const { t, locale } = useI18n()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadUserData() {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { setLoading(false); return }
      setUser(authUser)
      let { data: profileData } = await supabase.from('profiles').select('xp, full_name').eq('id', authUser.id).maybeSingle()
      if (!profileData) {
        const { data } = await supabase.from('profiles').select('xp, full_name').ilike('email', authUser.email).maybeSingle()
        profileData = data
      }
      if (!profileData) {
        const { data } = await supabase.from('users').select('user_xp as xp, display_name').eq('id', authUser.id).maybeSingle()
        profileData = data
      }
      if (profileData) setProfile(profileData)
      const [{ data: txData }, { data: ordersData }] = await Promise.all([
        supabase.from('transactions').select('id, points_added, amount_paid_mxn, package_name, created_at, artwork_id').eq('user_id', authUser.id).eq('status', 'COMPLETED').order('created_at', { ascending: false }),
        supabase.from('orders').select('id, total_amount_mxn, status, created_at').eq('buyer_email', authUser.email).order('created_at', { ascending: false })
      ])
      setTransactions(txData || [])
      setOrders(ordersData || [])
      setLoading(false)
    }
    loadUserData()
  }, [])

  if (loading) return <div className={styles.loading}><InlineLoading description={t('Cargando perfil de coleccionista...', 'Loading collector profile...')} /></div>
  if (!user) return <div className={styles.signedOut}><h1>{t('Inicia sesión', 'Sign in')}</h1><p>{t('Accede para consultar tu nivel, compras e impulsos.', 'Sign in to check your level, purchases and boosts.')}</p><Button as={Link} href="/login">{t('Iniciar sesión', 'Sign in')}</Button></div>

  const userXP = profile?.xp || profile?.user_xp || 0
  const { currentLevel, nextLevel, progressPercentage, xpNeeded } = getUserLevelInfo(userXP)
  const displayName = profile?.full_name || profile?.display_name || user.email?.split('@')[0]

  return <main className={styles.page}><div className={styles.shell}>
    <p className={styles.eyebrow}>{t('Perfil de coleccionista', 'Collector profile')}</p>
    <header className={styles.hero}>
      <div><h1 className={styles.title}>{displayName}</h1><p className={styles.email}>{user.email}</p></div>
      <div className={styles.level}><p className={styles.levelLabel}>{t('Nivel', 'Level')} {currentLevel.level} · {currentLevel.name || currentLevel.title}</p><p className={styles.xp}>{userXP.toLocaleString(locale)} XP</p></div>
    </header>

    <Tabs className={styles.tabs}>
      <TabList aria-label={t('Información del perfil', 'Profile information')} contained><Tab>{t('Resumen', 'Overview')}</Tab><Tab>{t('Compras', 'Purchases')} ({orders.length})</Tab><Tab>{t('Impulsos', 'Boosts')} ({transactions.length})</Tab></TabList>
      <TabPanels>
        <TabPanel className={styles.panel}>
          <section className={styles.progressTile} aria-labelledby="progress-title"><div className={styles.progressHeader}><p id="progress-title">{t('Progreso de nivel', 'Level progress')}</p><p className={styles.helper}>{nextLevel ? t(`Faltan ${xpNeeded.toLocaleString(locale)} XP para nivel ${nextLevel.level}`, `${xpNeeded.toLocaleString(locale)} XP left for level ${nextLevel.level}`) : t('Rango máximo alcanzado', 'Maximum rank reached')}</p></div><ProgressBar label={t('Progreso al siguiente nivel', 'Progress to next level')} hideLabel value={progressPercentage} /></section>
          <div className={styles.summary}>
            <ClickableTile className={styles.summaryTile} href="/collection"><div><span className={styles.metricLabel}>{t('Colección privada', 'Private collection')}</span><p className={styles.metric}>{t('Ver obras', 'View artworks')}</p></div><span className={styles.tileAction}>{t('Certificados y proveniencia', 'Certificates and provenance')} <ArrowRight size={16}/></span></ClickableTile>
            <ClickableTile className={styles.summaryTile} href="#profile-orders"><div><span className={styles.metricLabel}>{t('Compras', 'Purchases')}</span><p className={styles.metric}>{orders.length}</p></div><span className={styles.tileAction}>{t('Ver historial', 'View history')} <Package size={16}/></span></ClickableTile>
            <ClickableTile className={styles.summaryTile} href="#profile-impulses"><div><span className={styles.metricLabel}>{t('Impulsos', 'Boosts')}</span><p className={styles.metric}>{transactions.length}</p></div><span className={styles.tileAction}>{t('Ver actividad', 'View activity')} <Rocket size={16}/></span></ClickableTile>
          </div>
        </TabPanel>
        <TabPanel className={styles.panel} id="profile-orders"><div className={styles.sectionHeader}><h2>{t('Compras de obras', 'Artwork purchases')}</h2><Package size={20}/></div>{orders.length === 0 ? <div className={styles.empty}><ImageIcon size={32}/><strong>{t('Sin adquisiciones registradas', 'No purchases registered')}</strong><p>{t('Las compras realizadas con tu correo aparecerán aquí.', 'Purchases made with your email will appear here.')}</p></div> : <div className={styles.list}>{orders.map(ord => { const tag=orderTag(ord.status, t); return <article className={styles.row} key={ord.id}><div><p className={styles.rowTitle}>{t('Orden', 'Order')} #{ord.id.slice(0,8).toUpperCase()}</p><p className={styles.rowMeta}>{new Date(ord.created_at).toLocaleDateString(locale,{day:'numeric',month:'long',year:'numeric'})}</p></div><div className={styles.rowValue}><Tag type={tag.type} size="sm">{tag.text}</Tag><strong>${Number(ord.total_amount_mxn || 0).toLocaleString(locale)} MXN</strong></div></article>})}</div>}</TabPanel>
        <TabPanel className={styles.panel} id="profile-impulses"><div className={styles.sectionHeader}><h2>{t('Impulsos realizados', 'Boosts made')}</h2><Rocket size={20}/></div>{transactions.length === 0 ? <div className={styles.empty}><Rocket size={32}/><strong>{t('Aún no has impulsado una obra', "You haven't boosted an artwork yet")}</strong><p>{t('Tu actividad de apoyo al artista aparecerá aquí.', 'Your support activity for the artist will appear here.')}</p></div> : <div className={styles.list}>{transactions.map(tx => <article className={styles.row} key={tx.id}><div><p className={styles.rowTitle}>{tx.package_name || t('Paquete de puntos', 'Points package')}</p><p className={styles.rowMeta}>{new Date(tx.created_at).toLocaleDateString(locale,{day:'numeric',month:'long',year:'numeric'})}</p></div><div className={styles.rowValue}><strong>+{Number(tx.points_added || 0).toLocaleString(locale)} pts</strong><span>${Number(tx.amount_paid_mxn || 0).toLocaleString(locale)} MXN</span></div></article>)}</div>}</TabPanel>
      </TabPanels>
    </Tabs>
  </div></main>
}
