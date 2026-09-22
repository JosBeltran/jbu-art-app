'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { getUserLevelInfo } from '@/lib/userLevels'
import { ArrowRight, Image as ImageIcon, Package, Rocket } from '@carbon/icons-react'
import { Button, ClickableTile, InlineLoading, ProgressBar, Tab, TabList, TabPanel, TabPanels, Tabs, Tag } from '@carbon/react'
import styles from './Profile.module.css'

const orderTag = (status) => {
  if (status === 'DELIVERED') return { type: 'green', text: 'Entregado' }
  if (status === 'SHIPPED') return { type: 'blue', text: 'En camino' }
  return { type: 'gray', text: 'Pago confirmado' }
}

export default function ProfilePage() {
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

  if (loading) return <div className={styles.loading}><InlineLoading description="Cargando perfil de coleccionista..." /></div>
  if (!user) return <div className={styles.signedOut}><h1>Inicia sesión</h1><p>Accede para consultar tu nivel, compras e impulsos.</p><Button as={Link} href="/login">Iniciar sesión</Button></div>

  const userXP = profile?.xp || profile?.user_xp || 0
  const { currentLevel, nextLevel, progressPercentage, xpNeeded } = getUserLevelInfo(userXP)
  const displayName = profile?.full_name || profile?.display_name || user.email?.split('@')[0]

  return <main className={styles.page}><div className={styles.shell}>
    <p className={styles.eyebrow}>Perfil de coleccionista</p>
    <header className={styles.hero}>
      <div><h1 className={styles.title}>{displayName}</h1><p className={styles.email}>{user.email}</p></div>
      <div className={styles.level}><p className={styles.levelLabel}>Nivel {currentLevel.level} · {currentLevel.name || currentLevel.title}</p><p className={styles.xp}>{userXP.toLocaleString('es-MX')} XP</p></div>
    </header>

    <Tabs className={styles.tabs}>
      <TabList aria-label="Información del perfil" contained><Tab>Resumen</Tab><Tab>Compras ({orders.length})</Tab><Tab>Impulsos ({transactions.length})</Tab></TabList>
      <TabPanels>
        <TabPanel className={styles.panel}>
          <section className={styles.progressTile} aria-labelledby="progress-title"><div className={styles.progressHeader}><p id="progress-title">Progreso de nivel</p><p className={styles.helper}>{nextLevel ? `Faltan ${xpNeeded.toLocaleString('es-MX')} XP para nivel ${nextLevel.level}` : 'Rango máximo alcanzado'}</p></div><ProgressBar label="Progreso al siguiente nivel" hideLabel value={progressPercentage} /></section>
          <div className={styles.summary}>
            <ClickableTile className={styles.summaryTile} href="/collection"><div><span className={styles.metricLabel}>Colección privada</span><p className={styles.metric}>Ver obras</p></div><span className={styles.tileAction}>Certificados y proveniencia <ArrowRight size={16}/></span></ClickableTile>
            <ClickableTile className={styles.summaryTile} href="#profile-orders"><div><span className={styles.metricLabel}>Compras</span><p className={styles.metric}>{orders.length}</p></div><span className={styles.tileAction}>Ver historial <Package size={16}/></span></ClickableTile>
            <ClickableTile className={styles.summaryTile} href="#profile-impulses"><div><span className={styles.metricLabel}>Impulsos</span><p className={styles.metric}>{transactions.length}</p></div><span className={styles.tileAction}>Ver actividad <Rocket size={16}/></span></ClickableTile>
          </div>
        </TabPanel>
        <TabPanel className={styles.panel} id="profile-orders"><div className={styles.sectionHeader}><h2>Compras de obras</h2><Package size={20}/></div>{orders.length === 0 ? <div className={styles.empty}><ImageIcon size={32}/><strong>Sin adquisiciones registradas</strong><p>Las compras realizadas con tu correo aparecerán aquí.</p></div> : <div className={styles.list}>{orders.map(ord => { const tag=orderTag(ord.status); return <article className={styles.row} key={ord.id}><div><p className={styles.rowTitle}>Orden #{ord.id.slice(0,8).toUpperCase()}</p><p className={styles.rowMeta}>{new Date(ord.created_at).toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'})}</p></div><div className={styles.rowValue}><Tag type={tag.type} size="sm">{tag.text}</Tag><strong>${Number(ord.total_amount_mxn || 0).toLocaleString('es-MX')} MXN</strong></div></article>})}</div>}</TabPanel>
        <TabPanel className={styles.panel} id="profile-impulses"><div className={styles.sectionHeader}><h2>Impulsos realizados</h2><Rocket size={20}/></div>{transactions.length === 0 ? <div className={styles.empty}><Rocket size={32}/><strong>Aún no has impulsado una obra</strong><p>Tu actividad de apoyo al artista aparecerá aquí.</p></div> : <div className={styles.list}>{transactions.map(tx => <article className={styles.row} key={tx.id}><div><p className={styles.rowTitle}>{tx.package_name || 'Paquete de puntos'}</p><p className={styles.rowMeta}>{new Date(tx.created_at).toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'})}</p></div><div className={styles.rowValue}><strong>+{Number(tx.points_added || 0).toLocaleString('es-MX')} pts</strong><span>${Number(tx.amount_paid_mxn || 0).toLocaleString('es-MX')} MXN</span></div></article>)}</div>}</TabPanel>
      </TabPanels>
    </Tabs>
  </div></main>
}
