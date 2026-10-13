'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Button, Checkbox, Dropdown, InlineLoading, InlineNotification, NumberInput, Tab, TabList, TabPanel, TabPanels, Tabs, Tag, TextArea, TextInput, Toggle, Accordion, AccordionItem, ProgressBar } from '@carbon/react'
import { Share, Download, Copy, Link as LinkIcon, ArrowUp, ArrowDown, Video, Upload, Save } from '@carbon/icons-react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import { FORMATS, THEMES, compose, loadImage, loadLogo, lowResolution, makeQR } from '@/lib/promo/canvas'
import { autoStatus, buildCaption, defaultCampaign, loadEventTarget, loadLotTarget, lotNo, trackedUrl } from '@/lib/promo/data'
import styles from './PromotionStudio.module.css'

const EVENT_TOGGLES = { eventName: true, dates: true, lotCount: true, qr: false, website: true, logo: true, artworks: true, openLine: true }
const LOT_TOGGLES = { lotNumber: true, title: true, dimensions: false, currentBid: true, bidCount: false, closeTime: true, eventName: true, qr: false, website: true, logo: true }
const SOURCES = ['instagram', 'facebook', 'whatsapp', 'story', 'billboard', 'poster', 'digital_billboard', 'web', 'email']
const UNIT_TO_IN = { in: 1, cm: 1 / 2.54, ft: 12, px: null }

function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
const canvasBlob = (c) => new Promise((r) => c.toBlob(r, 'image/png'))

export default function PromotionStudio({ eventId = null, auctionId = null }) {
  const { t, locale } = useI18n()
  const [target, setTarget] = useState(undefined)
  const [tab, setTab] = useState(0)
  const [lang, setLang] = useState(locale?.startsWith('en') ? 'en' : 'es')
  const [theme, setTheme] = useState('light')
  const [statusMode, setStatusMode] = useState('AUTO')
  const [campaign, setCampaign] = useState('')
  const [source, setSource] = useState('instagram')
  const [social, setSocial] = useState({ format: 'feed', layout: 'hero' })
  const [outdoor, setOutdoor] = useState({ format: 'billboard', layout: 'collage', unit: 'ft', pw: 48, ph: 14, dpi: 100, px: false, pxW: 4800, pxH: 1400, safe: 4, bleed: 0 })
  const [videoCfg, setVideoCfg] = useState({ duration: 6, format: 'story', intro: 'gavel', transition: 'fade', introId: '', outroId: '', cw: 1920, ch: 1080 })
  const [toggles, setToggles] = useState({})
  const [outToggles, setOutToggles] = useState({})
  const [selected, setSelected] = useState([]) // obras representativas (solo promoción; no cambia lot_order)
  const [caption, setCaption] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [warn, setWarn] = useState('')
  const [assets, setAssets] = useState([])
  const [presets, setPresets] = useState([])
  const [video, setVideo] = useState(null)
  const [videoProgress, setVideoProgress] = useState(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    (async () => {
      const tg = eventId ? await loadEventTarget(eventId) : await loadLotTarget(auctionId)
      setTarget(tg)
      if (!tg) return
      setCampaign(defaultCampaign(tg))
      setToggles(tg.kind === 'EVENT' ? EVENT_TOGGLES : LOT_TOGGLES)
      setOutToggles(tg.kind === 'EVENT' ? { ...EVENT_TOGGLES, qr: true, openLine: false } : { ...LOT_TOGGLES, qr: true, currentBid: false, eventName: false })
      setSocial((s) => ({ ...s, layout: tg.kind === 'EVENT' ? 'hero' : 'single' }))
      setOutdoor((o) => ({ ...o, layout: tg.kind === 'EVENT' ? 'collage' : 'single' }))
      if (tg.kind === 'EVENT') setSelected(tg.items.slice(0, 5).map((i) => i.auction.id))
      const { data } = await supabase.from('promo_assets').select('*').order('created_at', { ascending: false })
      setAssets((data || []).filter((a) => a.kind !== 'OUTDOOR_PRESET'))
      setPresets((data || []).filter((a) => a.kind === 'OUTDOOR_PRESET'))
    })()
  }, [eventId, auctionId])

  const mode = ['social', 'outdoor', 'video', 'web'][tab]
  const medium = mode === 'outdoor' ? 'qr' : mode === 'video' ? 'video' : 'social'
  const url = target ? trackedUrl(target, { campaign, source: mode === 'outdoor' ? (outdoor.format === 'poster' ? 'poster' : outdoor.format === 'digital' ? 'digital_billboard' : 'billboard') : source, medium }) : ''
  const cleanUrl = target?.promo.url || ''

  useEffect(() => { if (target) setCaption(buildCaption(target, url, lang)) }, [target, url, lang])

  const status = useMemo(() => {
    if (!target) return null
    if (statusMode === 'AUTO') return autoStatus(target)
    if (statusMode === 'NONE') return null
    return STATUS_OPTIONS(target.kind).find((s) => s.key === statusMode) || null
  }, [target, statusMode])

  const images = useMemo(() => {
    if (!target) return []
    if (target.kind === 'LOT') return [target.item.artwork.primary_image_url]
    const byId = new Map(target.items.map((i) => [i.auction.id, i.artwork.primary_image_url]))
    const list = selected.map((id) => byId.get(id)).filter(Boolean)
    const minimalCover = target.event.cover_image_url
    return list.length ? list : (minimalCover ? [minimalCover] : [])
  }, [target, selected])

  const dims = useMemo(() => {
    if (mode === 'social') return FORMATS[social.format]
    if (mode === 'web') return FORMATS.og
    if (mode === 'video') return videoCfg.format === 'custom' ? { w: videoCfg.cw, h: videoCfg.ch } : FORMATS[{ story: 'story', v169: 'v169', square: 'square', billboard: 'digital' }[videoCfg.format]]
    if (outdoor.format !== 'custom') return FORMATS[outdoor.format]
    if (outdoor.px || outdoor.unit === 'px') return { w: Math.round(outdoor.pxW), h: Math.round(outdoor.pxH) }
    const f = UNIT_TO_IN[outdoor.unit] * outdoor.dpi
    return { w: Math.round(outdoor.pw * f), h: Math.round(outdoor.ph * f) }
  }, [mode, social.format, outdoor, videoCfg])

  const composeOpts = async () => {
    const th = THEMES[theme]
    const [imgs, logo, qr] = await Promise.all([
      Promise.all(images.map((src) => loadImage(src))),
      loadLogo(th.accent),
      makeQR(url, th),
    ])
    const tg = mode === 'outdoor' ? outToggles : toggles
    const layout = mode === 'outdoor' ? (outdoor.layout === 'collage' ? 'hero' : outdoor.layout) : mode === 'web' ? (target.kind === 'EVENT' ? 'grid' : 'single') : social.layout
    const W = Math.min(dims.w, 12000), H = Math.min(dims.h, 12000)
    const bleedPx = mode === 'outdoor' && outdoor.format === 'custom' && !outdoor.px ? Math.round((outdoor.bleed / 25.4) * outdoor.dpi) : 0
    const safe = mode === 'outdoor' ? Math.round(Math.min(W, H) * (outdoor.safe / 100)) : undefined
    return { target, lang, theme, layout, toggles: tg, images: imgs, logo, qr, status, W, H, safe, bleed: bleedPx, outdoor: mode === 'outdoor' }
  }

  // Render de vista previa
  useEffect(() => {
    if (!target || mode === 'video') return
    let cancelled = false
    ;(async () => {
      const opts = await composeOpts()
      if (cancelled || !canvasRef.current) return
      const c = canvasRef.current
      c.width = opts.W; c.height = opts.H
      const { scale } = compose(c.getContext('2d'), opts)
      setWarn(lowResolution(scale) ? t('La imagen original de la obra puede verse pixelada en este tamaño. Usa una foto de mayor resolución para impresión.', 'The artwork source image may look pixelated at this size. Use a higher-resolution photo for print.') : '')
    })()
    return () => { cancelled = true }
  }, [target, mode, lang, theme, status, social, outdoor, toggles, outToggles, images, url, dims])

  if (target === undefined) return <InlineLoading description={t('Cargando…', 'Loading…')} />
  if (target === null) return <InlineNotification kind="error" lowContrast hideCloseButton title={t('No se encontró. Publica el evento o la subasta primero (solo se promociona lo público).', 'Not found. Publish the event or auction first (only public items can be promoted).')} />

  const isEvent = target.kind === 'EVENT'
  const fileBase = isEvent ? `jbu-${target.event.slug}` : `jbu-lot-${lotNo(target.item.auction.lot_number)}-${target.item.artwork.sku}`
  const flash = (m) => { setNotice(m); setTimeout(() => setNotice(''), 2500) }
  const copy = async (text, m) => { try { await navigator.clipboard.writeText(text); flash(m) } catch { setError(t('No se pudo copiar.', 'Could not copy.')) } }

  const saveImage = async () => {
    const b = await canvasBlob(canvasRef.current)
    if (b) download(b, `${fileBase}-${mode}-${dims.w}x${dims.h}.png`)
  }

  const share = async (blobOverride, ext = 'png') => {
    setError('')
    try {
      const blob = blobOverride || await canvasBlob(canvasRef.current)
      const file = blob ? new File([blob], `${fileBase}.${ext}`, { type: blob.type }) : null
      const data = { title: isEvent ? target.event.name : target.item.artwork.title, text: caption, url }
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ ...data, files: [file] })
      else if (navigator.share) await navigator.share(data)
      else { if (blob) download(blob, file.name); await copy(caption, t('Imagen guardada y leyenda copiada.', 'Image saved and caption copied.')) }
    } catch (e) {
      if (e?.name !== 'AbortError') setError(t('Tu navegador no permitió compartir. Usa Guardar y Copiar leyenda.', 'Your browser blocked sharing. Use Save and Copy caption.'))
    }
  }

  const makeVideo = async () => {
    setError(''); setVideo(null); setVideoProgress(0)
    try {
      const opts = await composeOpts()
      const { renderVideo } = await import('@/lib/promo/video')
      const res = await renderVideo({
        target, lang, theme, W: opts.W, H: opts.H, duration: videoCfg.duration, intro: videoCfg.intro, transition: videoCfg.transition,
        introUrl: assets.find((a) => a.id === videoCfg.introId)?.url, outroUrl: assets.find((a) => a.id === videoCfg.outroId)?.url,
        composeOpts: { ...opts, toggles: { ...opts.toggles, qr: true }, layout: isEvent ? 'minimal' : 'single' }, images: opts.images, logo: opts.logo,
        onProgress: setVideoProgress,
      })
      setVideo({ ...res, url: URL.createObjectURL(res.blob) })
    } catch (e) {
      setError(e.message || String(e))
    }
    setVideoProgress(null)
  }

  const uploadAsset = async (file, kind) => {
    if (!file) return
    setError('')
    const path = `artwork-videos/promo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${file.name.split('.').pop()}`
    const { error: upErr } = await supabase.storage.from('artworks').upload(path, file, { cacheControl: '31536000', contentType: file.type })
    if (upErr) { setError(upErr.message); return }
    const { data } = supabase.storage.from('artworks').getPublicUrl(path)
    const { data: row, error } = await supabase.from('promo_assets').insert({ kind, label: file.name, url: data.publicUrl }).select().single()
    if (error) { setError(error.message.includes('promo_assets') ? t('Corre la migración 20261016_promo_assets.sql para guardar recursos.', 'Run migration 20261016_promo_assets.sql to save assets.') : error.message); return }
    setAssets((a) => [row, ...a]); flash(t('Recurso guardado para reutilizar.', 'Asset saved for reuse.'))
  }

  const savePreset = async () => {
    const label = `${outdoor.pw}×${outdoor.ph} ${outdoor.unit} · ${outdoor.dpi} ppp`
    const { data, error } = await supabase.from('promo_assets').insert({ kind: 'OUTDOOR_PRESET', label: outdoor.px ? `${outdoor.pxW}×${outdoor.pxH} px` : label, settings: outdoor }).select().single()
    if (error) { setError(error.message); return }
    setPresets((p) => [data, ...p]); flash(t('Medida guardada.', 'Size saved.'))
  }

  const toggleSet = mode === 'outdoor' ? outToggles : toggles
  const setToggle = (k, v) => (mode === 'outdoor' ? setOutToggles : setToggles)((p) => ({ ...p, [k]: v }))
  const toggleLabels = isEvent
    ? { eventName: t('Nombre del evento', 'Event name'), dates: t('Fechas', 'Dates'), lotCount: t('Número de lotes', 'Lot count'), qr: 'QR', website: t('Sitio web', 'Website'), logo: t('Logo JBU', 'JBU logo'), artworks: t('Obras representativas', 'Representative works'), openLine: t('"Pujas abiertas"', '"Bidding now open"') }
    : { lotNumber: t('Número de lote', 'Lot number'), title: t('Título de la obra', 'Artwork title'), dimensions: t('Medidas', 'Dimensions'), currentBid: t('Puja actual', 'Current bid'), bidCount: t('Número de pujas', 'Bid count'), closeTime: t('Hora de cierre', 'Close time'), eventName: t('Nombre del evento', 'Event name'), qr: 'QR', website: t('Sitio web', 'Website'), logo: t('Logo JBU', 'JBU logo') }

  const moveSel = (i, d) => setSelected((s) => { const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n })
  const toggleSel = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length >= 6 ? s : [...s, id])

  const layoutItems = isEvent
    ? (mode === 'outdoor' ? [['collage', t('Collage principal', 'Collage hero')], ['split', t('Dividido', 'Split')], ['minimal', t('Ultra minimal', 'Ultra minimal')]] : [['hero', t('Principal + apoyo', 'Hero + supporting')], ['grid', t('Cuadrícula', 'Grid')], ['minimal', t('Ultra minimal', 'Ultra minimal')]])
    : [['single', t('Obra', 'Artwork')], ['minimal', t('Minimal', 'Minimal')]]

  const Controls = (
    <div className={styles.controls}>
      <div className={styles.row}>
        <Dropdown id="lang" titleText={t('Idioma', 'Language')} label="" size="sm" items={['es', 'en']} itemToString={(i) => (i === 'en' ? 'English' : 'Español')} selectedItem={lang} onChange={({ selectedItem }) => setLang(selectedItem)} />
        <Dropdown id="theme" titleText={t('Fondo', 'Background')} label="" size="sm" items={['light', 'dark']} itemToString={(i) => (i === 'dark' ? t('Oscuro', 'Dark') : t('Claro', 'Light'))} selectedItem={theme} onChange={({ selectedItem }) => setTheme(selectedItem)} />
      </div>
      <Dropdown id="status" titleText={t('Estado', 'Status')} label="" size="sm" items={['AUTO', 'NONE', ...STATUS_OPTIONS(target.kind).map((s) => s.key)]}
        itemToString={(k) => k === 'AUTO' ? `AUTO · ${lang === 'en' ? autoStatus(target).en : autoStatus(target).es}` : k === 'NONE' ? t('Sin estado', 'No status') : (STATUS_OPTIONS(target.kind).find((s) => s.key === k)?.[lang] || k)}
        selectedItem={statusMode} onChange={({ selectedItem }) => setStatusMode(selectedItem)} />
      {statusMode !== 'AUTO' && statusMode !== 'NONE' && <p className={styles.hint}>{t('Elegiste el estado manualmente; verifica que coincide con los tiempos reales.', 'Status set manually; make sure it matches real timing.')}</p>}
      {mode !== 'web' && mode !== 'video' && (
        <Dropdown id="layout" titleText={t('Diseño', 'Layout')} label="" size="sm" items={layoutItems.map((l) => l[0])} itemToString={(k) => layoutItems.find((l) => l[0] === k)?.[1] || k}
          selectedItem={mode === 'outdoor' ? outdoor.layout : social.layout} onChange={({ selectedItem }) => (mode === 'outdoor' ? setOutdoor((o) => ({ ...o, layout: selectedItem })) : setSocial((s) => ({ ...s, layout: selectedItem })))} />
      )}
      {(mode === 'social' || mode === 'outdoor') && (
        <fieldset className={styles.toggles}>
          <legend className={styles.legend}>{t('Mostrar', 'Show')}</legend>
          {Object.keys(toggleLabels).map((k) => <Checkbox key={k} id={`tg-${k}`} labelText={toggleLabels[k]} checked={Boolean(toggleSet[k])} onChange={(_, { checked }) => setToggle(k, checked)} />)}
        </fieldset>
      )}
      {isEvent && (
        <fieldset className={styles.toggles}>
          <legend className={styles.legend}>{t('Obras representativas (máx. 6)', 'Representative works (max 6)')}</legend>
          <p className={styles.hint}>{t('Solo cambia la promoción; no altera el orden de los lotes.', 'Only affects promotion; lot order is unchanged.')}</p>
          {selected.map((id, i) => {
            const it = target.items.find((x) => x.auction.id === id)
            return it && (
              <div key={id} className={styles.selRow}>
                <span>{t('Lote', 'Lot')} {lotNo(it.auction.lot_number)} · {it.artwork.title}</span>
                <Button kind="ghost" size="sm" hasIconOnly renderIcon={ArrowUp} iconDescription={t('Subir', 'Up')} onClick={() => moveSel(i, -1)} disabled={i === 0} />
                <Button kind="ghost" size="sm" hasIconOnly renderIcon={ArrowDown} iconDescription={t('Bajar', 'Down')} onClick={() => moveSel(i, 1)} disabled={i === selected.length - 1} />
              </div>
            )
          })}
          <Accordion size="sm"><AccordionItem title={t('Elegir obras', 'Choose works')}>
            {target.items.map((it) => <Checkbox key={it.auction.id} id={`sel-${it.auction.id}`} labelText={`${t('Lote', 'Lot')} ${lotNo(it.auction.lot_number)} · ${it.artwork.title}`} checked={selected.includes(it.auction.id)} onChange={() => toggleSel(it.auction.id)} />)}
          </AccordionItem></Accordion>
        </fieldset>
      )}
      <Accordion size="sm">
        <AccordionItem title={t('Campaña y seguimiento', 'Campaign & tracking')}>
          <TextInput id="campaign" size="sm" labelText={t('Campaña', 'Campaign')} value={campaign} onChange={(e) => setCampaign(e.target.value)} />
          {mode !== 'outdoor' && <Dropdown id="source" titleText={t('Dónde se publica', 'Where it is posted')} label="" size="sm" items={SOURCES} selectedItem={source} onChange={({ selectedItem }) => setSource(selectedItem)} />}
          <p className={styles.hint}>{t('El QR y el enlace llevan parámetros de campaña (utm). Las visitas aparecen en Vercel Analytics por campaña y fuente.', 'QR and link carry campaign parameters (utm). Visits show in Vercel Analytics by campaign and source.')}</p>
          <code className={styles.url}>{url}</code>
        </AccordionItem>
      </Accordion>
    </div>
  )

  const Actions = (
    <div className={styles.actions}>
      <Button renderIcon={Share} onClick={() => share()}>{t('Compartir', 'Share')}</Button>
      <Button kind="secondary" renderIcon={Download} onClick={saveImage}>{t('Guardar imagen', 'Save image')}</Button>
      <Button kind="ghost" renderIcon={LinkIcon} onClick={() => copy(url, t('Enlace copiado.', 'Link copied.'))}>{t('Copiar enlace', 'Copy link')}</Button>
      <Button kind="ghost" renderIcon={Copy} onClick={() => copy(caption, t('Leyenda copiada.', 'Caption copied.'))}>{t('Copiar leyenda', 'Copy caption')}</Button>
    </div>
  )

  const Preview = (
    <div className={styles.previewWrap}>
      <canvas ref={canvasRef} className={styles.preview} style={{ aspectRatio: `${dims.w} / ${dims.h}` }} aria-label={t('Vista previa', 'Preview')} />
      <p className={styles.hint}>{dims.w} × {dims.h} px</p>
      {warn && <InlineNotification kind="warning" lowContrast hideCloseButton title={warn} />}
    </div>
  )

  return (
    <div className={styles.studio}>
      <header className={styles.head}>
        <p className={styles.kicker}>{t('Estudio de promoción', 'Share & Promotion Studio')}</p>
        <p className={styles.promoting}>{t('Promocionando', 'Promoting')}:</p>
        <div className={styles.targetLine}>
          <Tag type="purple" size="md">{isEvent ? t('EVENTO', 'EVENT') : `${t('LOTE', 'LOT')} ${lotNo(target.item.auction.lot_number)}`}</Tag>
          <h1 className={styles.title}>{isEvent ? target.event.name : target.item.artwork.title}</h1>
        </div>
        <div className={styles.switch}>
          {!isEvent && target.event && <Link href={`/admin/auction-events/${target.event.id}/promote`}>{t('Promocionar el evento', 'Promote the event')} · {target.event.name}</Link>}
          {isEvent && target.items.length > 0 && (
            <Dropdown id="lotswitch" size="sm" label={t('Promocionar un lote…', 'Promote a lot…')} titleText="" hideLabel items={target.items} itemToString={(i) => i ? `${t('Lote', 'Lot')} ${lotNo(i.auction.lot_number)} · ${i.artwork.title}` : ''} onChange={({ selectedItem }) => { if (selectedItem) window.location.href = `/admin/auctions/${selectedItem.auction.id}/promote` }} />
          )}
        </div>
      </header>
      {error && <InlineNotification kind="error" lowContrast title={error} onCloseButtonClick={() => setError('')} />}
      {notice && <InlineNotification kind="success" lowContrast title={notice} hideCloseButton />}

      <Tabs selectedIndex={tab} onChange={({ selectedIndex }) => setTab(selectedIndex)}>
        <TabList aria-label={t('Categorías', 'Categories')} contained={false}>
          <Tab>{t('Redes', 'Social')}</Tab><Tab>{t('Exterior', 'Outdoor')}</Tab><Tab>Video</Tab><Tab>Web</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            {tab === 0 && (
              <div className={styles.layout}>
                <div>
                  <div className={styles.formats}>{['feed', 'story', 'square'].map((f) => <Button key={f} size="sm" kind={social.format === f ? 'primary' : 'tertiary'} onClick={() => setSocial((s) => ({ ...s, format: f }))}>{FORMATS[f][lang]}</Button>)}</div>
                  {Preview}{Actions}
                  <TextArea id="caption" labelText={t('Leyenda', 'Caption')} rows={8} value={caption} onChange={(e) => setCaption(e.target.value)} />
                </div>
                {Controls}
              </div>
            )}
          </TabPanel>
          <TabPanel>
            {tab === 1 && (
              <div className={styles.layout}>
                <div>
                  <div className={styles.formats}>{['billboard', 'digital', 'poster', 'custom'].map((f) => <Button key={f} size="sm" kind={outdoor.format === f ? 'primary' : 'tertiary'} onClick={() => setOutdoor((o) => ({ ...o, format: f }))}>{f === 'custom' ? t('Medida personalizada', 'Custom size') : FORMATS[f][lang]}</Button>)}</div>
                  {outdoor.format === 'custom' && (
                    <div className={styles.custom}>
                      <Toggle id="pxmode" size="sm" labelText={t('Definir en píxeles', 'Set in pixels')} toggled={outdoor.px} onToggle={(v) => setOutdoor((o) => ({ ...o, px: v }))} />
                      {outdoor.px ? (<>
                        <NumberInput id="pxw" size="sm" label={t('Ancho (px)', 'Width (px)')} min={200} max={12000} value={outdoor.pxW} onChange={(_, { value }) => setOutdoor((o) => ({ ...o, pxW: Number(value) }))} />
                        <NumberInput id="pxh" size="sm" label={t('Alto (px)', 'Height (px)')} min={200} max={12000} value={outdoor.pxH} onChange={(_, { value }) => setOutdoor((o) => ({ ...o, pxH: Number(value) }))} />
                      </>) : (<>
                        <Dropdown id="unit" size="sm" titleText={t('Unidad', 'Unit')} label="" items={['ft', 'in', 'cm']} selectedItem={outdoor.unit} onChange={({ selectedItem }) => setOutdoor((o) => ({ ...o, unit: selectedItem }))} />
                        <NumberInput id="pw" size="sm" label={t('Ancho físico', 'Physical width')} min={1} step={0.5} value={outdoor.pw} onChange={(_, { value }) => setOutdoor((o) => ({ ...o, pw: Number(value) }))} />
                        <NumberInput id="ph" size="sm" label={t('Alto físico', 'Physical height')} min={1} step={0.5} value={outdoor.ph} onChange={(_, { value }) => setOutdoor((o) => ({ ...o, ph: Number(value) }))} />
                        <NumberInput id="dpi" size="sm" label={t('Resolución (ppp)', 'Resolution (dpi)')} min={10} max={300} value={outdoor.dpi} onChange={(_, { value }) => setOutdoor((o) => ({ ...o, dpi: Number(value) }))} />
                        <NumberInput id="bleed" size="sm" label={t('Rebase (mm)', 'Bleed (mm)')} min={0} max={100} value={outdoor.bleed} onChange={(_, { value }) => setOutdoor((o) => ({ ...o, bleed: Number(value) }))} />
                      </>)}
                      <NumberInput id="safe" size="sm" label={t('Margen de seguridad (%)', 'Safe margin (%)')} min={0} max={20} value={outdoor.safe} onChange={(_, { value }) => setOutdoor((o) => ({ ...o, safe: Number(value) }))} />
                      <p className={styles.hint}>{t('Proporción', 'Aspect ratio')} {(dims.w / dims.h).toFixed(2)}:1 · {dims.w} × {dims.h} px{(dims.w > 12000 || dims.h > 12000) ? ` · ${t('limitado a 12000 px; pide al proveedor un archivo escalable', 'capped at 12000 px; ask your printer about scaling')}` : ''}</p>
                      <Button size="sm" kind="ghost" renderIcon={Save} onClick={savePreset}>{t('Guardar medida', 'Save size')}</Button>
                      {presets.length > 0 && <Dropdown id="presets" size="sm" titleText={t('Medidas guardadas', 'Saved sizes')} label={t('Elegir…', 'Choose…')} items={presets} itemToString={(p) => p?.label || ''} onChange={({ selectedItem }) => selectedItem && setOutdoor({ ...selectedItem.settings, format: 'custom' })} />}
                    </div>
                  )}
                  {Preview}{Actions}
                  {!isEvent && <p className={styles.hint}>{t('La puja actual va apagada por defecto en exterior porque cambia; actívala en "Mostrar" si lo necesitas.', 'Current bid is off by default for outdoor because it changes; enable it under "Show" if needed.')}</p>}
                </div>
                {Controls}
              </div>
            )}
          </TabPanel>
          <TabPanel>
            {tab === 2 && (
              <div className={styles.layout}>
                <div className={styles.videoPane}>
                  <div className={styles.formats}>{[['story', '9:16'], ['v169', '16:9'], ['square', '1:1'], ['billboard', t('Espectacular digital', 'Digital billboard')], ['custom', t('Personalizado', 'Custom')]].map(([f, l]) => <Button key={f} size="sm" kind={videoCfg.format === f ? 'primary' : 'tertiary'} onClick={() => setVideoCfg((v) => ({ ...v, format: f }))}>{l}</Button>)}</div>
                  {videoCfg.format === 'custom' && (
                    <div className={styles.row}>
                      <NumberInput id="vcw" size="sm" label={t('Ancho (px)', 'Width (px)')} min={320} max={3840} value={videoCfg.cw} onChange={(_, { value }) => setVideoCfg((v) => ({ ...v, cw: Number(value) }))} />
                      <NumberInput id="vch" size="sm" label={t('Alto (px)', 'Height (px)')} min={320} max={3840} value={videoCfg.ch} onChange={(_, { value }) => setVideoCfg((v) => ({ ...v, ch: Number(value) }))} />
                    </div>
                  )}
                  <div className={styles.row}>
                    <Dropdown id="dur" size="sm" titleText={t('Duración', 'Duration')} label="" items={[6, 10]} itemToString={(d) => `${d} s`} selectedItem={videoCfg.duration} onChange={({ selectedItem }) => setVideoCfg((v) => ({ ...v, duration: selectedItem }))} />
                    <Dropdown id="intro" size="sm" titleText="Intro" label="" items={['gavel', 'typo', 'detail', 'logo', 'custom']} itemToString={(k) => ({ gavel: t('Mazo', 'Gavel'), typo: t('Tipográfica', 'Typographic'), detail: t('Detalle de obra', 'Artwork detail'), logo: 'JBU', custom: t('Creativo propio', 'Custom creative') })[k]} selectedItem={videoCfg.intro} onChange={({ selectedItem }) => setVideoCfg((v) => ({ ...v, intro: selectedItem }))} />
                    <Dropdown id="trans" size="sm" titleText={t('Transición', 'Transition')} label="" items={['fade', 'zoom', 'cut', 'slide']} itemToString={(k) => ({ fade: t('Fundido', 'Fade'), zoom: t('Zoom sutil', 'Subtle zoom'), cut: t('Corte editorial', 'Editorial cut'), slide: t('Deslizar', 'Slide') })[k]} selectedItem={videoCfg.transition} onChange={({ selectedItem }) => setVideoCfg((v) => ({ ...v, transition: selectedItem }))} />
                  </div>
                  <div className={styles.row}>
                    {videoCfg.intro === 'custom' && <Dropdown id="introasset" size="sm" titleText={t('Intro guardada', 'Saved intro')} label={t('Elegir…', 'Choose…')} items={assets.filter((a) => a.kind !== 'JBU_OUTRO')} itemToString={(a) => a ? `${a.kind} · ${a.label}` : ''} selectedItem={assets.find((a) => a.id === videoCfg.introId) || null} onChange={({ selectedItem }) => setVideoCfg((v) => ({ ...v, introId: selectedItem?.id || '' }))} />}
                    <Dropdown id="outroasset" size="sm" titleText={t('Cierre (opcional)', 'Outro (optional)')} label={t('Ninguno', 'None')} items={[null, ...assets.filter((a) => a.kind === 'JBU_OUTRO')]} itemToString={(a) => a ? a.label : t('Ninguno', 'None')} selectedItem={assets.find((a) => a.id === videoCfg.outroId) || null} onChange={({ selectedItem }) => setVideoCfg((v) => ({ ...v, outroId: selectedItem?.id || '' }))} />
                  </div>
                  <Accordion size="sm"><AccordionItem title={t('Subir creativo reutilizable (mazo, intro, outro, fondo)', 'Upload reusable creative (gavel, intro, outro, background)')}>
                    <div className={styles.uploads}>
                      {[['GAVEL_INTRO', t('Intro de mazo', 'Gavel intro')], ['JBU_INTRO', 'JBU intro'], ['JBU_OUTRO', 'JBU outro'], ['BACKGROUND_VIDEO', t('Video de fondo', 'Background video')]].map(([k, l]) => (
                        <label key={k} className={styles.upload}><Upload size={16} aria-hidden="true" />{l}<input type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => uploadAsset(e.target.files?.[0], k)} /></label>
                      ))}
                    </div>
                    <p className={styles.hint}>{t('Se guardan una vez y sirven para todos los eventos y lotes.', 'Saved once and reusable for every event and lot.')}</p>
                  </AccordionItem></Accordion>
                  <Button renderIcon={Video} disabled={videoProgress !== null} onClick={makeVideo}>{t('Generar video', 'Generate video')}</Button>
                  {videoProgress !== null && <ProgressBar label={t('Grabando… mantén esta pestaña visible', 'Recording… keep this tab visible')} value={Math.round(videoProgress * 100)} max={100} />}
                  {video && (
                    <>
                      <video src={video.url} controls playsInline muted className={styles.preview} style={{ aspectRatio: `${dims.w} / ${dims.h}` }} />
                      <div className={styles.actions}>
                        <Button renderIcon={Share} onClick={() => share(video.blob, video.ext)}>{t('Compartir', 'Share')}</Button>
                        <Button kind="secondary" renderIcon={Download} onClick={() => download(video.blob, `${fileBase}-${videoCfg.duration}s-${dims.w}x${dims.h}.${video.ext}`)}>{t('Guardar video', 'Save video')} (.{video.ext})</Button>
                        <Button kind="ghost" renderIcon={Copy} onClick={() => copy(caption, t('Leyenda copiada.', 'Caption copied.'))}>{t('Copiar leyenda', 'Copy caption')}</Button>
                      </div>
                      {video.ext === 'webm' && <p className={styles.hint}>{t('Este navegador graba en WebM. Para Instagram o pantallas que pidan MP4, genera el video desde Safari o Chrome reciente, o conviértelo.', 'This browser records WebM. For Instagram or screens that need MP4, generate from Safari or a recent Chrome, or convert it.')}</p>}
                    </>
                  )}
                  <p className={styles.hint}>{t('El último cuadro (título, fecha, QR, sitio) queda fijo y se entiende sin sonido.', 'The final frame (title, date, QR, website) holds still and reads without sound.')}</p>
                </div>
                {Controls}
              </div>
            )}
          </TabPanel>
          <TabPanel>
            {tab === 3 && (
              <div className={styles.layout}>
                <div>
                  {Preview}
                  <dl className={styles.og}>
                    <dt>og:title</dt><dd>{isEvent ? target.event.name : `${target.item.auction.lot_number ? `${lang === 'en' ? 'Lot' : 'Lote'} ${lotNo(target.item.auction.lot_number)} — ` : ''}${target.item.artwork.title} | ${lang === 'en' ? 'JBU Auction' : 'Subasta JBU'}`}</dd>
                    <dt>og:description</dt><dd>{isEvent ? (lang === 'en' ? `Explore ${target.event.lot_count} original works available through online auction.` : `Explora ${target.event.lot_count} obras originales en subasta en línea.`) : (lang === 'en' ? `Bid online for ${target.item.artwork.title}.` : `Puja en línea por ${target.item.artwork.title}.`)}</dd>
                    <dt>og:image</dt><dd>{isEvent ? (target.event.cover_image_url || target.items[0]?.artwork.primary_image_url || '—') : target.item.artwork.primary_image_url}</dd>
                    <dt>og:url</dt><dd>{cleanUrl}</dd>
                  </dl>
                  <p className={styles.hint}>{t('Estos datos ya se publican automáticamente al compartir el enlace. Puedes descargar esta imagen 1200×630 y usarla como portada del evento.', 'These tags are already published automatically when the link is shared. You can download this 1200×630 image and use it as the event cover.')}</p>
                  {Actions}
                </div>
                {Controls}
              </div>
            )}
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  )
}

function STATUS_OPTIONS(kind) {
  return kind === 'EVENT'
    ? [{ key: 'UPCOMING', es: 'Próxima subasta', en: 'Upcoming auction' }, { key: 'OPENS_TOMORROW', es: 'La subasta abre mañana', en: 'Auction opens tomorrow' }, { key: 'LIVE', es: 'Subasta en vivo', en: 'Live auction' }, { key: 'FINAL_24', es: 'Últimas 24 horas', en: 'Final 24 hours' }, { key: 'CLOSING_NOW', es: 'Cerrando ahora', en: 'Closing now' }, { key: 'ENDS_TODAY', es: 'Termina hoy', en: 'Ends today' }]
    : [{ key: 'LOT_UPCOMING', es: 'Próximo lote', en: 'Lot upcoming' }, { key: 'LOT_LIVE', es: 'Lote en vivo', en: 'Lot live' }, { key: 'FINAL_24', es: 'Últimas 24 horas', en: 'Final 24 hours' }, { key: 'FINAL_HOURS', es: 'Últimas horas', en: 'Final hours' }, { key: 'NEW_HIGH', es: 'Nueva puja más alta', en: 'New highest bid' }, { key: 'LOT_CLOSING', es: 'Lote cerrando ahora', en: 'Lot closing now' }]
}
