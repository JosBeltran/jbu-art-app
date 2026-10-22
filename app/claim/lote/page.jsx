'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import ArtworkImage from '@/components/ArtworkImage'
import { useI18n } from '@/components/I18nProvider'
import { Button, Checkbox, InlineLoading, InlineNotification, Tag } from '@carbon/react'
import { Checkmark, Key } from '@carbon/icons-react'
import styles from '../Claim.module.css'

// Registro de colección / reclamación de certificados. No es una página comercial: sin precios.
function ClaimLoteContent() {
  const { t } = useI18n()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const router = useRouter()
  const [group, setGroup] = useState(null)
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const returnPath = `/claim/lote?token=${encodeURIComponent(token || '')}`
  const loginHref = `/login?next=${encodeURIComponent(returnPath)}&redirectTo=${encodeURIComponent(returnPath)}`

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return }
    const res = await fetch(`/api/claims/batch?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    if (res.ok) {
      setGroup(json.group)
      setItems(json.items || [])
      setSelected(new Set((json.items || []).filter((i) => i.state === 'AVAILABLE').map((i) => i.id)))
    } else setGroup(null)
    setLoading(false)
  }, [token])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => { if (active) setUser(data?.session?.user || null) })
    load()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => { if (active) setUser(session?.user || null) })
    return () => { active = false; sub?.subscription?.unsubscribe() }
  }, [load])

  const toggle = (id, checked) => setSelected((prev) => { const next = new Set(prev); if (checked) next.add(id); else next.delete(id); return next })

  async function handleClaim() {
    if (!user) { router.push(loginHref); return }
    setError(''); setNotice('')
    const itemIds = items.filter((i) => i.state === 'AVAILABLE' && selected.has(i.id)).map((i) => i.id)
    if (!itemIds.length) return
    setClaiming(true)
    try {
      const { data } = await supabase.auth.getSession()
      const res = await fetch('/api/claims/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data?.session?.access_token || ''}` },
        body: JSON.stringify({ token, itemIds }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(t('No fue posible enviar la reclamación. Inténtalo de nuevo.', 'The claim could not be submitted. Please try again.')); return }
      const claimed = (json.results || []).filter((r) => r.status === 'claimed').length
      setNotice(t(`${claimed} obra(s) enviadas a revisión. Recibirás cada certificado al ser aprobado.`, `${claimed} artwork(s) sent for review. You will receive each certificate once approved.`))
      await load()
    } finally { setClaiming(false) }
  }

  const stateTag = (state) => {
    if (state === 'VERIFIED') return <Tag type="green" size="sm">{t('Reclamada · Verificada', 'Claimed · Verified')}</Tag>
    if (state === 'CLAIM_PENDING') return <Tag type="purple" size="sm">{t('Reclamación en revisión', 'Claim pending')}</Tag>
    if (state === 'UNAVAILABLE') return <Tag type="gray" size="sm">{t('No disponible', 'Unavailable')}</Tag>
    return <Tag type="blue" size="sm">{t('Disponible para reclamar', 'Available to claim')}</Tag>
  }

  if (loading) return <div className={styles.loading}><InlineLoading description={t('Cargando obras...', 'Loading artworks...')} /></div>

  if (!group) return <main className={styles.page}><div className={styles.error}><InlineNotification lowContrast kind="error" title={t('Lote no disponible', 'Lot not available')} subtitle={t('El enlace no existe o ya expiró.', 'The link does not exist or has expired.')} hideCloseButton /></div></main>

  const available = items.filter((i) => i.state === 'AVAILABLE')
  const chosen = available.filter((i) => selected.has(i.id)).length
  const footerText = items.length === 0
    ? t('No encontramos obras en este enlace. Contacta al estudio si crees que es un error.', 'We could not find artworks for this link. Contact the studio if you think this is a mistake.')
    : available.length
      ? t('Cada obra seleccionada genera su propia reclamación y su propio certificado de autenticidad.', 'Each selected artwork creates its own claim and its own certificate of authenticity.')
      : t('Todas las obras de este registro ya fueron reclamadas.', 'All artworks in this registration have already been claimed.')

  return <main className={styles.page}><div className={styles.loteShell}>
    <header className={styles.loteHeader}>
      <div>
        <p className={styles.eyebrow}>{t('Registro de colección · Reclamación de certificados', 'Collection registration · Certificate claim')}</p>
        <h1 className={styles.title}>{group.buyer_name ? `${t('Hola,', 'Hello,')} ${group.buyer_name}` : t('Tus obras te esperan', 'Your artworks are waiting')}</h1>
      </div>
      {items.length > 0 && <p className={styles.count}>{t(`${available.length} de ${items.length} por reclamar`, `${available.length} of ${items.length} to claim`)}</p>}
    </header>
    {error && <InlineNotification lowContrast kind="error" title={error} hideCloseButton />}
    {notice && <InlineNotification lowContrast kind="success" title={notice} hideCloseButton />}
    <div className={styles.items}>{items.map((item) => (
      <article className={styles.item} key={item.id}>
        <div className={styles.imageWrap}><ArtworkImage title={item.title} primaryUrl={item.image} sku={item.sku} className={styles.image} /></div>
        <div className={styles.itemBody}>
          <p className={styles.sku}>{item.sku}</p>
          <h2 className={styles.itemTitle}>{item.title}</h2>
          {(item.artist || item.year) && <p className={styles.sku}>{[item.artist, item.year].filter(Boolean).join(' · ')}</p>}
          {stateTag(item.state)}
          {item.state === 'AVAILABLE' && (
            <Checkbox id={`claim-${item.id}`} labelText={t('Incluir en mi reclamación', 'Include in my claim')} checked={selected.has(item.id)} onChange={(_e, { checked }) => toggle(item.id, checked)} />
          )}
        </div>
      </article>
    ))}</div>
    <footer className={styles.loteFooter}>
      <p>{footerText}</p>
      {available.length > 0 && (
        <Button onClick={handleClaim} disabled={claiming || (user && chosen === 0)} size="lg" renderIcon={user ? Checkmark : Key}>
          {claiming ? t('Enviando...', 'Submitting...') : user ? t(`Confirmar reclamación (${chosen})`, `Confirm claim (${chosen})`) : t('Iniciar sesión para reclamar', 'Sign in to claim')}
        </Button>
      )}
    </footer>
  </div></main>
}

export default function ClaimLotePage() { return <Suspense fallback={<div className={styles.suspense} />}><ClaimLoteContent /></Suspense> }
