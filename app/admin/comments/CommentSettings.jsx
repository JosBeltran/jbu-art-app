'use client'

import { useEffect, useState } from 'react'
import { Button, Checkbox, InlineLoading, InlineNotification, TextArea, TextInput, Tile } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'

export default function CommentSettings({ request, mutate, busy }) {
  const { t } = useI18n()
  const [config, setConfig] = useState(null)
  const [risk, setRisk] = useState('')
  const [sku, setSku] = useState('')
  const [artwork, setArtwork] = useState(null)
  const [enabled, setEnabled] = useState(true)
  const [lookup, setLookup] = useState('')
  const [lookupBusy, setLookupBusy] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    request({ view: 'settings' }, undefined, controller.signal).then(({ config: data }) => {
      if (controller.signal.aborted) return
      const { risk_patterns, ...fields } = data
      setConfig(fields)
      setRisk(risk_patterns.join('\n'))
    }).catch(() => { if (!controller.signal.aborted) setLoadError(true) })
    return () => controller.abort()
  }, [request])

  async function findArtwork(event) {
    event.preventDefault()
    setLookup('')
    setArtwork(null)
    setLookupBusy(true)
    try {
      const result = await request({ view: 'settings', sku: sku.trim() })
      setArtwork(result.artwork || null)
      setEnabled(result.enabled)
      if (!result.artwork) setLookup(t('No se encontró el SKU.', 'SKU not found.'))
    } catch { setLookup(t('No se pudo consultar la obra.', 'Could not look up the artwork.')) }
    finally { setLookupBusy(false) }
  }

  if (loadError) return <InlineNotification kind="error" title={t('No se pudo cargar la configuración.', 'Could not load settings.')} />
  if (!config) return <InlineLoading />
  const toggle = (key, es, en) => <Checkbox id={'comment-setting-' + key} labelText={t(es, en)} checked={config[key]}
    onChange={(_e, { checked }) => setConfig({ ...config, [key]: checked })} />
  const number = (key, es, en, min, max) => <TextInput id={'comment-setting-' + key} labelText={t(es, en)} type="number"
    min={min} max={max} required value={config[key]} onChange={e => setConfig({ ...config, [key]: e.target.value })} />
  return <div className="grid gap-4">
    <Tile>
      <h2>{t('Moderación global', 'Global moderation')}</h2>
      <form className="grid gap-3" onSubmit={e => {
        e.preventDefault()
        void mutate({ action: 'settings', settings: { ...config, trust_threshold: Number(config.trust_threshold),
          max_length: Number(config.max_length), rate_limit: Number(config.rate_limit),
          risk_patterns: risk.split('\n').map(line => line.trim()).filter(Boolean) } })
      }}>
        {toggle('enabled', 'Habilitar comentarios', 'Enable comments')}
        {toggle('auto_publish', 'Publicar automáticamente para participantes de confianza', 'Auto-publish for trusted participants')}
        {toggle('mandatory_review', 'Revisar todos los comentarios de visitantes', 'Review all visitor comments')}
        {toggle('allow_links', 'Permitir enlaces', 'Allow links')}
        {toggle('notifications_enabled', 'Notificar al equipo de administración', 'Notify administrators')}
        {toggle('allow_replies', 'Permitir respuestas de visitantes', 'Allow visitor replies')}
        {toggle('allow_display_name', 'Permitir un nombre público personalizado', 'Allow custom public display names')}
        {number('trust_threshold', 'Aprobaciones humanas para ganar confianza', 'Human approvals required for trust', 1, 50)}
        {number('max_length', 'Máximo de caracteres', 'Maximum characters', 100, 4000)}
        {number('rate_limit', 'Máximo de comentarios por 10 minutos', 'Maximum comments per 10 minutes', 1, 30)}
        <TextArea id="comment-risk-patterns" labelText={t('Frases que requieren revisión, una por línea', 'Phrases that require review, one per line')}
          value={risk} onChange={e => setRisk(e.target.value)} maxLength={1620} rows={3} />
        <div><Button type="submit" size="sm" disabled={busy}>{t('Guardar configuración', 'Save settings')}</Button></div>
      </form>
    </Tile>
    <Tile>
      <h2>{t('Comentarios por obra', 'Comments by artwork')}</h2>
      <form className="grid gap-3" onSubmit={findArtwork}>
        <TextInput id="comment-artwork-sku" labelText={t('SKU de la obra o versión', 'Artwork or version SKU')}
          value={sku} required maxLength={150} onChange={e => { setSku(e.target.value); setArtwork(null) }} />
        <div><Button kind="secondary" type="submit" size="sm" disabled={lookupBusy}>{t('Buscar', 'Find')}</Button></div>
      </form>
      {lookup && <p role="status">{lookup}</p>}
      {artwork && <div className="mt-3 grid gap-2">
        <p>{artwork.title} · {artwork.sku}</p>
        <Checkbox id="comment-artwork-enabled" labelText={t('Habilitar comentarios en esta obra', 'Enable comments for this artwork')}
          checked={enabled} onChange={(_e, { checked }) => setEnabled(checked)} />
        <div><Button size="sm" disabled={busy} onClick={() => void mutate({ action: 'settings', artwork: artwork.id, enabled })}>
          {t('Guardar para esta obra', 'Save for this artwork')}
        </Button></div>
      </div>}
    </Tile>
  </div>
}
