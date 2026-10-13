'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, InlineLoading, InlineNotification, Tag } from '@carbon/react'
import { Add, Edit } from '@carbon/icons-react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'

export default function AdminAuctionEventsPage() {
  const { t, locale } = useI18n()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('auction_events').select('*, auctions(id)').order('starts_at', { ascending: false })
      if (error) {
        setError(error.message.includes('auction_events') ? t('Falta activar eventos: corre la migración 20261015_auction_events.sql en Supabase.', 'Events are not enabled: run migration 20261015_auction_events.sql in Supabase.') : error.message)
        setRows([]); return
      }
      setRows(data || [])
    })()
  }, [])

  return (
    <div style={{ maxWidth: 1040, display: 'grid', gap: '1.5rem' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'end', gap: '1rem' }}>
        <div>
          <p style={{ fontSize: '.75rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--jbu-purple)' }}>{t('Ventas', 'Sales')}</p>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 400, margin: '.25rem 0 0' }}>{t('Eventos de subasta', 'Auction events')}</h1>
        </div>
        <Link href="/admin/auction-events/new"><Button renderIcon={Add}>{t('Crear evento', 'Create event')}</Button></Link>
      </header>
      {error && <InlineNotification kind="error" lowContrast title={t('Error', 'Error')} subtitle={error} />}
      {rows === null ? <InlineLoading description={t('Cargando…', 'Loading…')} /> : rows.length === 0 ? (
        <p style={{ color: 'var(--cds-text-secondary)' }}>{t('Aún no hay eventos. Un evento agrupa varias subastas como lotes.', 'No events yet. An event groups several auctions as lots.')}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid var(--cds-border-subtle)' }}>
          {rows.map((e) => (
            <li key={e.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.5rem 1.25rem', padding: '1rem 0', borderBottom: '1px solid var(--cds-border-subtle)' }}>
              <span style={{ flex: '1 1 14rem', display: 'grid', gap: '.25rem' }}>
                <span style={{ fontWeight: 500 }}>{e.name}</span>
                <span style={{ fontSize: '.8125rem', color: 'var(--cds-text-secondary)' }}>/auctions/{e.slug} · {new Date(e.starts_at).toLocaleString(locale)}</span>
              </span>
              <Tag size="sm" type={e.status === 'DRAFT' ? 'gray' : e.status === 'CANCELLED' ? 'red' : 'purple'}>{e.status}</Tag>
              {e.featured && <Tag size="sm" type="cool-gray">{t('Destacado', 'Featured')}</Tag>}
              <span style={{ fontSize: '.875rem', color: 'var(--cds-text-secondary)' }}>{e.auctions?.length || 0} {t('lotes', 'lots')}</span>
              <Link href={`/admin/auction-events/${e.id}`}><Button kind="tertiary" size="sm" renderIcon={Edit}>{t('Abrir', 'Open')}</Button></Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
