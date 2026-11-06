'use client'

import { useRef, useState } from 'react'
import { Button, InlineNotification, ProgressBar, Tag } from '@carbon/react'
import { Play, View, StopFilledAlt } from '@carbon/icons-react'
import { authHeaders } from '@/lib/authHeaders'
import { useI18n } from '@/components/I18nProvider'
import { parseStorageUrl } from '@/lib/mediaVariants'
import { optimizeImage, optimizeVideo, videoStatus } from '@/lib/mediaOptimizer'

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`
const EMPTY = {
  artworks: 0, artworksDone: 0, files: 0, filesDone: 0,
  optimized: 0, pending: 0, skipped: 0, failed: 0, unsupported: 0,
  originalBytes: 0, optimizedBytes: 0, duplicates: 0, references: 0, queryErrors: 0,
  counts: { artworkPrimary: 0, artworkGallery: 0, provenanceImages: 0, provenancePrimary: 0 },
}

/** Full admin inventory, including private and administrative provenance. */
async function collectJobs() {
  const res = await fetch('/api/admin/media/inventory', {
    headers: { ...(await authHeaders()) }, cache: 'no-store',
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !Array.isArray(json.jobs)) throw new Error(json.error || `Inventory HTTP ${res.status}`)
  return json
}

export default function OptimizeMediaPage() {
  const { t } = useI18n()
  const [running, setRunning] = useState(null) // 'dry' | 'real' | null
  const [stats, setStats] = useState(EMPTY)
  const [log, setLog] = useState([])
  const [current, setCurrent] = useState('')
  const [error, setError] = useState('')
  const stopRef = useRef(false)

  const run = async (dryRun) => {
    setRunning(dryRun ? 'dry' : 'real')
    setError('')
    setStats({ ...EMPTY, counts: { ...EMPTY.counts } })
    setLog([])
    stopRef.current = false
    const s = { ...EMPTY }
    const push = (entry) => setLog((prev) => [entry, ...prev].slice(0, 300))
    try {
      const inventory = await collectJobs()
      const jobs = inventory.jobs
      s.artworks = inventory.artworks
      s.files = jobs.length
      s.counts = inventory.counts
      s.references = inventory.references
      s.duplicates = inventory.duplicates
      setStats({ ...s })
      const seenArtworks = new Set()
      for (const file of jobs) {
        if (stopRef.current) break
        const name = `${file.references.map((r) => r.artwork_id).join(', ')} · ${file.type === 'video' ? 'video' : t('foto', 'photo')}`
        setCurrent(name)
        let result
        try {
          if (!parseStorageUrl(file.url)) result = { status: 'unsupported', error: t('URL o formato no compatible con el almacenamiento público de obras.', 'URL or format is not supported by the public artworks storage.') }
          else if (file.type === 'image') result = await optimizeImage(file.url, { dryRun })
          else if (dryRun) result = { status: await videoStatus(file.url) }
          else result = await optimizeVideo(file.url, { onProgress: (p, step) => setCurrent(`${name} · ${step === 'encode' ? `${Math.round(p * 100)}%` : step}`) })
        } catch (err) {
          result = { status: 'failed', error: err?.message || String(err) }
        }
        s.filesDone += 1
        s[result.status] = (s[result.status] || 0) + 1
        for (const reference of file.references) seenArtworks.add(reference.artwork_id)
        s.artworksDone = seenArtworks.size
        if (result.status === 'optimized') {
          s.originalBytes += result.originalBytes || 0
          s.optimizedBytes += result.optimizedBytes || 0
        }
        setStats({ ...s })
        push({ name, url: file.url, sources: [...new Set(file.references.map((r) => r.source))], ...result })
      }

    } catch (err) {
      s.queryErrors += 1
      setStats({ ...s })
      setError(err?.message || String(err))
      push({ name: t('Error de consulta', 'Query error'), status: 'failed', error: err?.message || String(err) })
    } finally {
      setCurrent('')
      setRunning(null)
    }
  }

  const statusLabel = {
    optimized: [t('Optimizado', 'Optimized'), 'green'],
    pending: [t('Por optimizar', 'To optimize'), 'purple'],
    skipped: [t('Ya optimizado', 'Already optimized'), 'gray'],
    failed: [t('Falló', 'Failed'), 'red'],
    unsupported: [t('Fuera del almacenamiento', 'External file'), 'warm-gray'],
  }
  const saved = Math.max(0, stats.originalBytes - stats.optimizedBytes)

  return (
    <div style={{ maxWidth: 960, display: 'grid', gap: '1.5rem' }}>
      <header>
        <p style={{ fontSize: '.75rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--jbu-purple, var(--cds-text-secondary))' }}>{t('Medios', 'Media')}</p>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 400, margin: '.25rem 0 .5rem' }}>{t('Optimizar medios existentes', 'Optimize existing media')}</h1>
        <p style={{ color: 'var(--cds-text-secondary)', maxWidth: '60ch' }}>
          {t(
            'Crea versiones ligeras de todas las fotos (miniatura, mediana y grande en WebP) y una versión web de cada video con su póster. Los originales no se tocan. Lo que ya está optimizado se salta, así que puedes repetirlo cuando quieras.',
            'Creates light versions of every photo (thumbnail, medium and large WebP) and a web version of each video with its poster. Originals are never touched. Anything already optimized is skipped, so you can run it again at any time.'
          )}
        </p>
      </header>

      <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
        <Button kind="secondary" renderIcon={View} disabled={!!running} onClick={() => run(true)}>{t('Prueba (sin cambios)', 'Dry run (no changes)')}</Button>
        <Button renderIcon={Play} disabled={!!running} onClick={() => run(false)}>{t('Optimizar ahora', 'Optimize now')}</Button>
        {running && <Button kind="ghost" renderIcon={StopFilledAlt} onClick={() => { stopRef.current = true }}>{t('Detener', 'Stop')}</Button>}
      </div>

      {running === 'real' && (
        <InlineNotification kind="info" lowContrast hideCloseButton title={t('No cierres esta pestaña', 'Keep this tab open')} subtitle={t('Los videos se convierten en este navegador y pueden tardar varios minutos cada uno.', 'Videos are converted in this browser and can take several minutes each.')} />
      )}
      {error && <InlineNotification kind="error" lowContrast title={t('Error', 'Error')} subtitle={error} onCloseButtonClick={() => setError('')} />}

      {(running || stats.files > 0) && (
        <ProgressBar
          label={running === 'dry' ? t('Revisando…', 'Checking…') : running ? t('Optimizando…', 'Optimizing…') : t('Terminado', 'Finished')}
          helperText={current || `${stats.filesDone} / ${stats.files}`}
          value={stats.filesDone}
          max={Math.max(1, stats.files)}
          status={running ? 'active' : 'finished'}
        />
      )}

      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1px', background: 'var(--cds-border-subtle)', border: '1px solid var(--cds-border-subtle)' }}>
        {[
          [t('Obras encontradas', 'Artworks found'), stats.artworks],
          [t('Obras con medios revisados', 'Artworks with media checked'), stats.artworksDone],
          [t('Archivos revisados', 'Files checked'), `${stats.filesDone} / ${stats.files}`],
          [t('Referencias encontradas', 'Media references'), stats.references],
          [t('Archivos duplicados', 'Duplicate references'), stats.duplicates],
          [t('Imágenes principales de obras', 'Artwork primary images'), stats.counts.artworkPrimary],
          [t('Imágenes de galería', 'Artwork gallery images'), stats.counts.artworkGallery],
          [t('Imágenes de eventos históricos', 'Provenance event images'), stats.counts.provenanceImages],
          [t('Portadas de eventos históricos', 'Provenance primary images'), stats.counts.provenancePrimary],
          [t('No compatibles', 'Unsupported'), stats.unsupported],
          [t('Errores de consulta', 'Query errors'), stats.queryErrors],
          [t('Optimizados', 'Optimized'), stats.optimized],
          [t('Por optimizar', 'To optimize'), stats.pending],
          [t('Ya optimizados', 'Already optimized'), stats.skipped],
          [t('Fallos', 'Failures'), stats.failed],
          [t('Tamaño original', 'Original size'), mb(stats.originalBytes)],
          [t('Tamaño optimizado', 'Optimized size'), mb(stats.optimizedBytes)],
          [t('Ahorro por visita', 'Saved per view'), stats.originalBytes ? `${mb(saved)} (${Math.round((saved / stats.originalBytes) * 100)}%)` : '—'],
        ].map(([label, value]) => (
          <div key={label} style={{ background: 'var(--cds-layer)', padding: '1rem' }}>
            <dt style={{ fontSize: '.75rem', color: 'var(--cds-text-secondary)' }}>{label}</dt>
            <dd style={{ fontSize: '1.25rem', marginTop: '.25rem' }}>{value}</dd>
          </div>
        ))}
      </dl>

      {log.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid var(--cds-border-subtle)' }}>
          {log.map((entry, idx) => {
            const [label, type] = statusLabel[entry.status] || [entry.status, 'gray']
            return (
              <li key={idx} style={{ display: 'flex', gap: '.75rem', alignItems: 'center', padding: '.5rem 0', borderBottom: '1px solid var(--cds-border-subtle)', fontSize: '.875rem' }}>
                <Tag size="sm" type={type}>{label}</Tag>
                <span title={entry.url || entry.name} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name} {entry.sources?.length ? ` · ${entry.sources.join(', ')}` : ''}</span>
                {entry.status === 'optimized' && <span style={{ color: 'var(--cds-text-secondary)' }}>{mb(entry.originalBytes)} → {mb(entry.optimizedBytes)}</span>}
                {entry.error && <span style={{ color: 'var(--cds-text-error)' }}>{entry.error}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
