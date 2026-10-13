'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, InlineLoading, InlineNotification, Tag } from '@carbon/react'
import { Add, Edit } from '@carbon/icons-react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import { formatMXN } from '@/lib/auctions'

const AUCTION_STATUS_TAG = {
  DRAFT: 'gray', UPCOMING: 'cool-gray', LIVE: 'green', ENDED: 'gray', SOLD: 'purple', RESERVE_NOT_MET: 'warm-gray', CANCELLED: 'red',
}

export default function AdminAuctionsPage() {
  const { t, locale } = useI18n()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      await supabase.rpc('settle_auctions', { _auction: null })
      const { data, error } = await supabase.from('auctions').select('*, artworks(title, sku)').order('created_at', { ascending: false })
      if (error) {
        setError(error.message.includes('auctions') ? t('Falta activar subastas: corre la migración 20261014_auctions.sql en Supabase.', 'Auctions are not enabled: run migration 20261014_auctions.sql in Supabase.') : error.message)
        setRows([]); return
      }
      const withWatchers = await Promise.all((data || []).map(async (a) => {
        const { data: n } = await supabase.rpc('admin_auction_watchers', { _auction: a.id })
        return { ...a, watchers: n ?? 0 }
      }))
      setRows(withWatchers)
    }
    load()
  }, [])

  const label = (s) => ({
    DRAFT: t('Borrador', 'Draft'), UPCOMING: t('Próxima', 'Upcoming'), LIVE: t('En vivo', 'Live'), ENDED: t('Terminada', 'Ended'),
    SOLD: t('Vendida', 'Sold'), RESERVE_NOT_MET: t('Reserva no alcanzada', 'Reserve not met'), CANCELLED: t('Cancelada', 'Cancelled'),
  }[s] || s)

  return (
    <div style={{ maxWidth: 1040, display: 'grid', gap: '1.5rem' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'end', gap: '1rem' }}>
        <div>
          <p style={{ fontSize: '.75rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--jbu-purple)' }}>{t('Ventas', 'Sales')}</p>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 400, margin: '.25rem 0 0' }}>{t('Subastas', 'Auctions')}</h1>
        </div>
        <Link href="/admin/auctions/new"><Button renderIcon={Add}>{t('Crear subasta', 'Create auction')}</Button></Link>
      </header>
      {error && <InlineNotification kind="error" lowContrast title={t('Error', 'Error')} subtitle={error} />}
      {rows === null ? <InlineLoading description={t('Cargando…', 'Loading…')} /> : rows.length === 0 ? (
        <p style={{ color: 'var(--cds-text-secondary)' }}>{t('Aún no hay subastas.', 'No auctions yet.')}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid var(--cds-border-subtle)' }}>
          {rows.map((a) => (
            <li key={a.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.5rem 1.25rem', padding: '1rem 0', borderBottom: '1px solid var(--cds-border-subtle)' }}>
              <span style={{ flex: '1 1 14rem', display: 'grid', gap: '.25rem' }}>
                <span style={{ fontWeight: 500 }}>{a.artworks?.title || a.artwork_id}</span>
                <span style={{ fontSize: '.8125rem', color: 'var(--cds-text-secondary)' }}>
                  {new Date(a.starts_at).toLocaleString(locale)} → {new Date(a.ends_at).toLocaleString(locale)}
                </span>
              </span>
              <Tag size="sm" type={AUCTION_STATUS_TAG[a.status]}>{label(a.status)}</Tag>
              <span style={{ fontSize: '.875rem' }}>{formatMXN(a.current_bid ?? a.starting_bid, locale)}</span>
              <span style={{ fontSize: '.875rem', color: 'var(--cds-text-secondary)' }}>{a.bid_count} {t('pujas', 'bids')} · {a.watchers} {t('seguidores', 'watchers')}</span>
              <Link href={`/admin/auctions/${a.id}`}><Button kind="tertiary" size="sm" renderIcon={Edit}>{t('Abrir', 'Open')}</Button></Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
