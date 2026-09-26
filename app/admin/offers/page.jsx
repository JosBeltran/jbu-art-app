'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { InlineLoading, InlineNotification, ContentSwitcher, Switch } from '@carbon/react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import OffersList from '@/components/OffersList'
import listStyles from '@/components/OffersList.module.css'

const FILTERS = ['ALL', 'PENDING', 'ACCEPTED', 'REJECTED']

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return session ? { Authorization: `Bearer ${session.access_token}` } : {}
}

export default function AdminOffersPage() {
  const { t } = useI18n()
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [updatingId, setUpdatingId] = useState(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/offers', { headers: await authHeaders() })
    const json = await res.json().catch(() => ({}))
    if (res.ok) { setOffers(json.offers || []); setError('') }
    else setError(json.error || 'Error')
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const changeStatus = async (id, status) => {
    setUpdatingId(id)
    const res = await fetch('/api/admin/offers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ id, status })
    })
    if (res.ok) setOffers((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)))
    else setError(t('No se pudo actualizar la oferta.', 'Could not update the offer.'))
    setUpdatingId(null)
  }

  const visible = useMemo(() => (filter === 'ALL' ? offers : offers.filter((o) => o.status === filter)), [offers, filter])
  const labels = { ALL: t('Todas', 'All'), PENDING: t('Pendientes', 'Pending'), ACCEPTED: t('Aceptadas', 'Accepted'), REJECTED: t('Rechazadas', 'Declined') }
  const count = (f) => (f === 'ALL' ? offers.length : offers.filter((o) => o.status === f).length)

  return (
    <section>
      <h1 style={{ fontWeight: 300, marginBottom: '0.5rem' }}>{t('Ofertas recibidas', 'Received offers')}</h1>
      <p style={{ color: 'var(--cds-text-secondary)', marginBottom: '1.5rem' }}>{t('Propuestas enviadas desde «Hacer una oferta».', 'Proposals sent from “Make an offer”.')}</p>
      <ContentSwitcher size="sm" selectedIndex={FILTERS.indexOf(filter)} onChange={({ index }) => setFilter(FILTERS[index])} style={{ maxWidth: '36rem', marginBottom: '1.5rem' }}>
        {FILTERS.map((f) => <Switch key={f} name={f} text={`${labels[f]} (${count(f)})`} />)}
      </ContentSwitcher>
      {error && <InlineNotification kind="error" lowContrast title="Error" subtitle={error} onCloseButtonClick={() => setError('')} />}
      {loading ? <InlineLoading description={t('Cargando ofertas...', 'Loading offers...')} />
        : visible.length === 0 ? <p className={listStyles.empty}>{t('No hay ofertas en esta vista.', 'No offers in this view.')}</p>
        : <OffersList offers={visible} admin onStatusChange={changeStatus} updatingId={updatingId} />}
    </section>
  )
}
