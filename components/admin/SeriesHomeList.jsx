'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, InlineLoading, InlineNotification, Tag, Toggle } from '@carbon/react'
import { ArrowUp, ArrowDown, Edit, Save } from '@carbon/icons-react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import { effectiveStatus } from '@/lib/homeSeries'

function statusMeta(t) {
  return {
    active: [t('Activa', 'Active'), 'green'],
    coming_soon: [t('Próximamente', 'Coming soon'), 'purple'],
    outlet: [t('Selección especial', 'Special selection'), 'warm-gray'],
    archived: [t('Archivada', 'Archived'), 'gray'],
  }
}

export default function SeriesHomeList() {
  const { t } = useI18n()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const meta = statusMeta(t)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('series').select('*').order('home_order', { ascending: true }).order('title', { ascending: true })
    if (error) {
      setError(error.message.includes('home_order')
        ? t('Falta activar la portada por series: corre la migración 20261013_series_editorial.sql en Supabase.', 'Series home is not enabled yet: run migration 20261013_series_editorial.sql in Supabase.')
        : error.message)
      const fallback = await supabase.from('series').select('*').order('title')
      setRows(fallback.data || [])
    } else setRows(data || [])
    setLoading(false)
    setDirty(false)
  }
  useEffect(() => { load() }, [])

  const move = (idx, dir) => {
    const next = [...rows]
    const j = idx + dir
    if (j < 0 || j >= next.length) return
    ;[next[idx], next[j]] = [next[j], next[idx]]
    setRows(next.map((r, i) => ({ ...r, home_order: i + 1 })))
    setDirty(true)
  }
  const toggleHome = (idx, value) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, home_featured: value } : r)))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    setError('')
    for (const [i, r] of rows.entries()) {
      const { error } = await supabase.from('series').update({ home_order: i + 1, home_featured: Boolean(r.home_featured) }).eq('id', r.id)
      if (error) { setError(error.message); setSaving(false); return }
    }
    setSaving(false)
    setDirty(false)
    setNotice(t('Orden de portada guardado.', 'Home order saved.'))
  }

  return (
    <div style={{ maxWidth: 960, display: 'grid', gap: '1.5rem' }}>
      {error && <InlineNotification kind="error" lowContrast title={t('Error', 'Error')} subtitle={error} onCloseButtonClick={() => setError('')} />}
      {notice && <InlineNotification kind="success" lowContrast title={notice} onCloseButtonClick={() => setNotice('')} />}
      {loading ? <InlineLoading description={t('Cargando…', 'Loading…')} /> : (
        <>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid var(--cds-border-subtle)' }}>
            {rows.map((r, idx) => {
              const status = effectiveStatus(r)
              const [label, type] = meta[status] || meta.active
              return (
                <li key={r.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.75rem 1rem', padding: '.875rem 0', borderBottom: '1px solid var(--cds-border-subtle)' }}>
                  <span style={{ display: 'flex' }}>
                    <Button kind="ghost" size="sm" hasIconOnly renderIcon={ArrowUp} iconDescription={t('Subir', 'Move up')} disabled={idx === 0} onClick={() => move(idx, -1)} />
                    <Button kind="ghost" size="sm" hasIconOnly renderIcon={ArrowDown} iconDescription={t('Bajar', 'Move down')} disabled={idx === rows.length - 1} onClick={() => move(idx, 1)} />
                  </span>
                  <span style={{ fontFamily: 'var(--font-plex-mono), monospace', fontSize: '.75rem', color: 'var(--cds-text-secondary)', width: '1.5rem' }}>{idx + 1}</span>
                  <span style={{ flex: '1 1 12rem', fontWeight: 500 }}>{r.title}</span>
                  <Tag size="sm" type={type}>{label}</Tag>
                  <Toggle size="sm" id={`home-${r.id}`} labelText={t('En portada', 'On home')} hideLabel labelA={t('Oculta', 'Hidden')} labelB={t('En portada', 'On home')} toggled={Boolean(r.home_featured)} onToggle={(v) => toggleHome(idx, v)} />
                  <Link href={`/admin/series/${r.id}`}><Button kind="tertiary" size="sm" renderIcon={Edit}>{t('Editar', 'Edit')}</Button></Link>
                </li>
              )
            })}
          </ol>
          <div><Button renderIcon={Save} disabled={!dirty || saving} onClick={save}>{saving ? t('Guardando…', 'Saving…') : t('Guardar orden', 'Save order')}</Button></div>
        </>
      )}
    </div>
  )
}
