'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { InlineLoading, InlineNotification, Button } from '@carbon/react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import OffersList from '@/components/OffersList'
import listStyles from '@/components/OffersList.module.css'

export default function MyOffersPage() {
  const { t } = useI18n()
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/my-offers', { headers: { Authorization: `Bearer ${session.access_token}` } })
      const json = await res.json().catch(() => ({}))
      if (res.ok) setOffers(json.offers || [])
      else setError(json.error || t('No se pudieron cargar tus ofertas.', 'Could not load your offers.'))
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section>
      <p style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--jbu-purple)', margin: 0 }}>{t('Registro privado', 'Private registry')}</p>
      <h1 style={{ fontWeight: 300, margin: '0.25rem 0 0.5rem' }}>{t('Mis ofertas', 'My offers')}</h1>
      <p style={{ color: 'var(--cds-text-secondary)', marginBottom: '2rem', maxWidth: '40rem' }}>
        {t('Aquí ves las propuestas que has enviado y su estado. El artista te contactará por correo.', 'Here you can see the proposals you have sent and their status. The artist will contact you by email.')}
      </p>
      {loading ? <InlineLoading description={t('Cargando ofertas...', 'Loading offers...')} />
        : error ? <InlineNotification kind="error" lowContrast hideCloseButton title={t('Error', 'Error')} subtitle={error} />
        : offers.length === 0 ? (
          <div className={listStyles.empty}>
            <p>{t('Aún no has hecho ninguna oferta.', "You haven't made any offers yet.")}</p>
            <Button as={Link} href="/catalog" kind="tertiary" size="sm" style={{ marginTop: '1rem' }}>{t('Explorar catálogo', 'Explore catalog')}</Button>
          </div>
        ) : <OffersList offers={offers} />}
    </section>
  )
}
