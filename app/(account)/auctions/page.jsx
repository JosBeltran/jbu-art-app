'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { InlineLoading, Tab, TabList, TabPanel, TabPanels, Tabs, Tag } from '@carbon/react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n, useLocalized } from '@/components/I18nProvider'
import OptimizedImg from '@/components/media/OptimizedImg'
import { formatMXN } from '@/lib/auctions'

function stateOf(row, t) {
  if (row.won) return [row.payment_status === 'PAID' ? t('Ganaste · Pagada', 'Won · Paid') : t('Ganaste', 'Won'), 'purple']
  if (row.status === 'LIVE' && row.is_leading) return [t('Vas ganando', 'Leading'), 'green']
  if (row.status === 'LIVE' && row.my_max) return [t('Te superaron', 'Outbid'), 'red']
  if (row.status === 'LIVE') return [t('En vivo', 'Live'), 'green']
  if (row.status === 'UPCOMING') return [t('Próxima', 'Upcoming'), 'cool-gray']
  if (row.status === 'RESERVE_NOT_MET') return [t('Reserva no alcanzada', 'Reserve not met'), 'gray']
  return [t('Terminó', 'Ended'), 'gray']
}

function List({ rows, artworks, empty }) {
  const { t, locale } = useI18n()
  const L = useLocalized()
  if (!rows.length) return <p style={{ color: 'var(--cds-text-secondary)', padding: '1.5rem 0' }}>{empty}</p>
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {rows.map((r) => {
        const art = artworks.get(r.artwork_id) || {}
        const [label, type] = stateOf(r, t)
        return (
          <li key={r.auction_id} style={{ borderBottom: '1px solid var(--cds-border-subtle)' }}>
            <Link href={`/artwork/${art.sku}`} style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: '1rem', padding: '1rem 0', color: 'inherit', textDecoration: 'none' }}>
              <span style={{ display: 'block', aspectRatio: '4 / 5', overflow: 'hidden', background: 'var(--jbu-lavender)' }}>
                {art.primary_image_url && <OptimizedImg src={art.primary_image_url} alt={L(art, 'title')} variant="thumbnail" sizes="72px" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </span>
              <span style={{ display: 'grid', gap: '.25rem', alignContent: 'start' }}>
                <span style={{ fontWeight: 500 }}>{L(art, 'title') || '—'}</span>
                <span style={{ fontSize: '.875rem', color: 'var(--cds-text-secondary)' }}>
                  {t('Puja actual', 'Current bid')} {formatMXN(r.current_bid, locale)}{r.my_max ? ` · ${t('Tu máxima', 'Your max')} ${formatMXN(r.my_max, locale)}` : ''}
                </span>
                <span><Tag size="sm" type={type}>{label}</Tag></span>
                {r.won && r.payment_status === 'PENDING' && <span style={{ fontSize: '.8125rem', color: 'var(--jbu-purple)' }}>{t('Completa tu pago desde la ficha de la obra', 'Complete your payment from the artwork page')}</span>}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export default function MyAuctionsPage() {
  const { t } = useI18n()
  const [rows, setRows] = useState(null)
  const [artworks, setArtworks] = useState(new Map())

  useEffect(() => {
    const load = async () => {
      try { await supabase.rpc('settle_auctions', { _auction: null }) } catch {}
      const { data } = await supabase.rpc('my_auctions')
      const list = data || []
      if (list.length) {
        const { data: arts } = await supabase.from('artworks').select('*').in('id', [...new Set(list.map((r) => r.artwork_id))])
        setArtworks(new Map((arts || []).map((a) => [a.id, a])))
      }
      setRows(list)
    }
    load()
  }, [])

  if (rows === null) return <InlineLoading description={t('Cargando…', 'Loading…')} />
  const watching = rows.filter((r) => r.watching && ['LIVE', 'UPCOMING'].includes(r.status))
  const bidding = rows.filter((r) => r.my_max && !r.won)
  const won = rows.filter((r) => r.won)

  return (
    <div style={{ maxWidth: 820, display: 'grid', gap: '1.5rem' }}>
      <header>
        <p style={{ fontSize: '.75rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--jbu-purple)' }}>{t('Mi espacio', 'My space')}</p>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 300, margin: '.25rem 0' }}>{t('Subastas', 'Auctions')}</h1>
      </header>
      <Tabs>
        <TabList aria-label={t('Subastas', 'Auctions')} contained={false}>
          <Tab>{t('Siguiendo', 'Watching')} ({watching.length})</Tab>
          <Tab>{t('Pujando', 'Bidding')} ({bidding.length})</Tab>
          <Tab>{t('Ganadas', 'Won')} ({won.length})</Tab>
        </TabList>
        <TabPanels>
          <TabPanel><List rows={watching} artworks={artworks} empty={t('No sigues ninguna subasta abierta.', 'You are not watching any open auction.')} /></TabPanel>
          <TabPanel><List rows={bidding} artworks={artworks} empty={t('Aún no has pujado.', 'You have not placed any bids yet.')} /></TabPanel>
          <TabPanel><List rows={won} artworks={artworks} empty={t('Aún no has ganado subastas.', 'You have not won any auctions yet.')} /></TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  )
}
