'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Checkbox, ContentSwitcher, InlineNotification, Modal, ProgressBar, Select, SelectItem, Switch, TextArea } from '@carbon/react'
import { Share, Download, Copy, Link as LinkIcon, Video } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import { loadImage, loadLogo, makeQR } from '@/lib/promo/canvas'
import { SERIES_FORMATS, SERIES_THEMES, composeRelease } from '@/lib/promo/seriesCanvas'
import { VIDEO_STYLES, renderSeriesVideo } from '@/lib/promo/seriesVideo'
import { CTAS, MODES, PROMO_TYPES, buildReleaseCaption, buildReleaseCopy, ctaLabel, orderWorks, seriesPublicUrl, suggestCta, suggestMode, suggestType, typeLabel } from '@/lib/promo/seriesRelease'
import styles from './SeriesReleaseStudio.module.css'

const TOGGLES = { title: true, subtitle: true, description: false, date: true, works: true, website: true, logo: true, qr: false, cta: true, multiple: true }

function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
const canvasBlob = (c) => new Promise((r) => c.toBlob(r, 'image/png'))
const slug = (s) => String(s || 'serie').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** SERIES RELEASE STUDIO: piezas de lanzamiento de una Serie. Solo presentación. */
export default function SeriesReleaseStudio({ open, onClose, series, works = [], mainArtworkId = '' }) {
  const { t, locale } = useI18n()
  const ordered = useMemo(() => orderWorks(works, mainArtworkId), [works, mainArtworkId])
  const [lang, setLang] = useState(locale?.startsWith('en') ? 'en' : 'es')
  const [type, setType] = useState(() => suggestType(series))
  const [mode, setMode] = useState(() => suggestMode(suggestType(series), ordered.length))
  const [cta, setCta] = useState(() => suggestCta(suggestType(series)))
  const [format, setFormat] = useState('feed')
  const [themeKey, setThemeKey] = useState('dark')
  const [toggles, setToggles] = useState(TOGGLES)
  const [style, setStyle] = useState('drop')
  const [duration, setDuration] = useState(10)
  const [assets, setAssets] = useState({ images: [], logo: null, qr: null })
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [videoBlob, setVideoBlob] = useState(null)
  const canvasRef = useRef(null)

  const theme = SERIES_THEMES[themeKey]
  const fmt = SERIES_FORMATS[format]
  const isVideo = fmt.group === 'video' || format === 'clixmedia'
  const url = seriesPublicUrl(series)
  const copy = useMemo(() => buildReleaseCopy({ series, type, cta, lang, workCount: ordered.length }), [series, type, cta, lang, ordered.length])
  const caption = useMemo(() => buildReleaseCaption({ series, type, lang, url }), [series, type, lang, url])
  const opts = { W: fmt.w, H: fmt.h, theme, copy, images: assets.images, mode, toggles: { ...toggles, qr: toggles.qr || format === 'clixmedia' }, logo: assets.logo, qr: assets.qr }

  const changeType = (next) => { setType(next); setMode(suggestMode(next, ordered.length)); setCta(suggestCta(next)) }

  useEffect(() => {
    if (!open) return
    let alive = true
    Promise.all([
      Promise.all(ordered.slice(0, 4).map((w) => loadImage(w.primary_image_url))),
      loadLogo(theme.ink),
      makeQR(url, theme).catch(() => null),
    ]).then(([images, logo, qr]) => { if (alive) setAssets({ images: images.filter(Boolean), logo, qr }) })
    return () => { alive = false }
  }, [open, ordered, themeKey, url])

  useEffect(() => {
    const c = canvasRef.current
    if (!open || !c) return
    c.width = fmt.w; c.height = fmt.h
    composeRelease(c.getContext('2d'), opts)
  })
  useEffect(() => { setVideoBlob(null) }, [format, type, mode, cta, lang, themeKey, toggles, style, duration])
  const videoUrl = useMemo(() => (videoBlob ? URL.createObjectURL(videoBlob) : ''), [videoBlob])
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl) }, [videoUrl])

  const fileBase = `jbu-${slug(series?.title)}-${type.toLowerCase()}-${format}`
  const flash = (m) => { setNotice(m); setTimeout(() => setNotice(''), 2500) }
  const copyText = async (text, msg) => { try { await navigator.clipboard.writeText(text); flash(msg) } catch { setError(t('No se pudo copiar.', 'Could not copy.')) } }

  const saveImage = async () => { const b = await canvasBlob(canvasRef.current); if (b) download(b, `${fileBase}.png`) }

  const makeVideo = async () => {
    setBusy(true); setError(''); setProgress(0)
    try {
      const blob = await renderSeriesVideo({ ...opts, duration: format === 'clixmedia' ? 15 : duration, style, onProgress: setProgress })
      setVideoBlob(blob)
      return blob
    } catch {
      setError(t('Este navegador no puede generar video. Prueba en Chrome o Safari reciente.', 'This browser cannot generate video. Try a recent Chrome or Safari.'))
      return null
    } finally { setBusy(false) }
  }
  const saveVideo = async () => { const b = videoBlob || await makeVideo(); if (b) download(b, `${fileBase}.${b.type.includes('mp4') ? 'mp4' : 'webm'}`) }

  const share = async () => {
    setError('')
    try {
      const blob = isVideo ? (videoBlob || await makeVideo()) : await canvasBlob(canvasRef.current)
      const ext = blob?.type.includes('mp4') ? 'mp4' : blob?.type.includes('webm') ? 'webm' : 'png'
      const file = blob ? new File([blob], `${fileBase}.${ext}`, { type: blob.type }) : null
      const data = { title: copy.name, text: caption, url }
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ ...data, files: [file] })
      else if (navigator.share) await navigator.share(data)
      else { if (blob) download(blob, file.name); await copyText(caption, t('Pieza guardada y texto copiado.', 'Asset saved and caption copied.')) }
    } catch (e) {
      if (e?.name !== 'AbortError') setError(t('Tu navegador no permitió compartir. Usa Guardar y Copiar texto.', 'Your browser blocked sharing. Use Save and Copy caption.'))
    }
  }

  const tg = (k, es, en) => <Checkbox key={k} id={`srs-${k}`} labelText={t(es, en)} checked={toggles[k]} onChange={(_, { checked }) => setToggles((p) => ({ ...p, [k]: checked }))} />

  return (
    <Modal open={open} onRequestClose={onClose} passiveModal size="lg" modalLabel={t('Promover serie', 'Promote series')} modalHeading="SERIES RELEASE STUDIO" className={styles.modal}>
      <div className={styles.layout}>
        <div className={styles.preview} style={{ background: theme.bg }}>
          <canvas ref={canvasRef} className={styles.canvas} style={{ aspectRatio: `${fmt.w} / ${fmt.h}` }} aria-label={t('Vista previa', 'Preview')} />
          {videoBlob && <video className={styles.canvas} src={videoUrl} controls muted playsInline />}
        </div>
        <div className={styles.controls}>
          <ContentSwitcher size="sm" selectedIndex={lang === 'en' ? 1 : 0} onChange={({ name }) => setLang(name)}>
            <Switch name="es" text="ES" /><Switch name="en" text="EN" />
          </ContentSwitcher>
          <Select id="srs-format" labelText={t('Formato', 'Format')} value={format} onChange={(e) => setFormat(e.target.value)}>
            {['social', 'web', 'outdoor', 'video'].map((g) => Object.entries(SERIES_FORMATS).filter(([, f]) => f.group === g).map(([k, f]) => (
              <SelectItem key={k} value={k} text={`${t({ social: 'Social', web: 'Web', outdoor: 'Exterior', video: 'Video' }[g], { social: 'Social', web: 'Web', outdoor: 'Outdoor', video: 'Video' }[g])} · ${f[lang]}`} />
            )))}
          </Select>
          <Select id="srs-type" labelText={t('Tipo de promoción', 'Promotion type')} value={type} onChange={(e) => changeType(e.target.value)}>
            {PROMO_TYPES.map((p) => <SelectItem key={p} value={p} text={typeLabel(p, 'en')} />)}
          </Select>
          <Select id="srs-mode" labelText={t('Composición', 'Composition')} value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODES.map((m) => <SelectItem key={m} value={m} text={{ hero: t('Obra principal', 'Hero work'), grid: t('Retícula / selección', 'Grid / selection'), typo: t('Lanzamiento tipográfico', 'Typographic release') }[m]} />)}
          </Select>
          <Select id="srs-cta" labelText="CTA" value={cta} onChange={(e) => setCta(e.target.value)}>
            {CTAS.map((c) => <SelectItem key={c} value={c} text={ctaLabel(c, lang)} />)}
          </Select>
          <ContentSwitcher size="sm" selectedIndex={themeKey === 'light' ? 1 : 0} onChange={({ name }) => setThemeKey(name)}>
            <Switch name="dark" text={t('Oscuro', 'Dark')} /><Switch name="light" text={t('Claro', 'Light')} />
          </ContentSwitcher>
          {isVideo && (
            <div className={styles.row}>
              <Select id="srs-style" labelText={t('Estilo de video', 'Video style')} value={style} onChange={(e) => setStyle(e.target.value)}>
                {VIDEO_STYLES.map((s) => <SelectItem key={s} value={s} text={{ typographic: t('Tipográfico', 'Typographic release'), reveal: t('Revelado de obra', 'Artwork reveal'), drop: 'Studio drop' }[s]} />)}
              </Select>
              {format !== 'clixmedia' && (
                <Select id="srs-duration" labelText={t('Duración', 'Duration')} value={String(duration)} onChange={(e) => setDuration(Number(e.target.value))}>
                  {[6, 10, 15].map((d) => <SelectItem key={d} value={String(d)} text={`${d} s`} />)}
                </Select>
              )}
            </div>
          )}
          <fieldset className={styles.toggles}>
            {tg('title', 'Título', 'Series title')}{tg('subtitle', 'Subtítulo', 'Subtitle')}{tg('description', 'Descripción corta', 'Short description')}
            {tg('date', 'Fecha de lanzamiento', 'Release date')}{tg('works', 'Número de obras', 'Number of works')}{tg('website', 'Sitio web', 'Website')}
            {tg('logo', 'Logo JBU', 'JBU logo')}{tg('qr', 'Código QR', 'QR code')}{tg('cta', 'CTA', 'CTA')}{tg('multiple', 'Varias obras', 'Multiple artworks')}
          </fieldset>
          {ordered.length === 0 && <InlineNotification kind="info" lowContrast hideCloseButton title={t('Sin imágenes', 'No images')} subtitle={t('La serie aún no tiene obras con imagen; se usará el diseño tipográfico.', 'The series has no artworks with images yet; the typographic layout is used.')} />}
          {busy && <ProgressBar label={t('Generando video…', 'Generating video…')} value={progress * 100} max={100} size="small" />}
          {error && <InlineNotification kind="error" lowContrast title={error} onCloseButtonClick={() => setError('')} />}
          {notice && <InlineNotification kind="success" lowContrast title={notice} hideCloseButton />}
          <div className={styles.actions}>
            <Button size="md" renderIcon={Share} disabled={busy} onClick={share}>{t('Compartir', 'Share')}</Button>
            {isVideo
              ? <Button size="md" kind="secondary" renderIcon={Video} disabled={busy} onClick={saveVideo}>{t('Guardar video', 'Save video')}</Button>
              : <Button size="md" kind="secondary" renderIcon={Download} onClick={saveImage}>{t('Guardar imagen', 'Save image')}</Button>}
            {isVideo && <Button size="md" kind="ghost" renderIcon={Download} onClick={saveImage}>{t('Cuadro final', 'Final frame')}</Button>}
            <Button size="md" kind="ghost" renderIcon={LinkIcon} onClick={() => copyText(url, t('Enlace copiado.', 'Link copied.'))}>{t('Copiar enlace', 'Copy link')}</Button>
            <Button size="md" kind="ghost" renderIcon={Copy} onClick={() => copyText(caption, t('Texto copiado.', 'Caption copied.'))}>{t('Copiar texto', 'Copy caption')}</Button>
          </div>
          <TextArea id="srs-caption" labelText={t('Texto para redes', 'Social caption')} rows={6} value={caption} readOnly />
        </div>
      </div>
    </Modal>
  )
}
