// Composición de piezas promocionales en <canvas>. Nunca recorta ni altera color de las obras (solo "contain").
import QRCode from 'qrcode'
import { SITE_LABEL, fmtClose, fmtDateRange, fmtMXN, lotNo } from './data'

export const THEMES = {
  light: { bg: '#f6f4f0', ink: '#161616', muted: '#6f6f6f', accent: '#6929c4', frame: '#ece8f3', qrDark: '#161616', qrLight: '#f6f4f0' },
  dark: { bg: '#121212', ink: '#f4f4f4', muted: '#a8a8a8', accent: '#be95ff', frame: '#1e1b22', qrDark: '#121212', qrLight: '#f4f4f4' },
}

export const FORMATS = {
  feed: { w: 1080, h: 1350, es: 'Feed 4:5', en: 'Feed 4:5' },
  story: { w: 1080, h: 1920, es: 'Historia 9:16', en: 'Story 9:16' },
  square: { w: 1080, h: 1080, es: 'Cuadrado 1:1', en: 'Square 1:1' },
  billboard: { w: 4800, h: 1400, es: 'Espectacular estático (48×14 ft)', en: 'Static billboard (48×14 ft)', outdoor: true },
  digital: { w: 1400, h: 400, es: 'Espectacular digital (1400×400)', en: 'Digital billboard (1400×400)', outdoor: true },
  clixmedia: { w: 768, h: 288, es: 'CLIXMEDIA — 768×288', en: 'CLIXMEDIA — 768×288', outdoor: true, duration: 15 },
  poster: { w: 3600, h: 5400, es: 'Póster 24×36 in (150 ppp)', en: 'Poster 24×36 in (150 dpi)', outdoor: true },
  og: { w: 1200, h: 630, es: 'Vista previa web 1200×630', en: 'Web preview 1200×630' },
  v169: { w: 1920, h: 1080, es: '16:9', en: '16:9' },
}

const cache = new Map()
export function loadImage(src) {
  if (!src) return Promise.resolve(null)
  if (cache.has(src)) return cache.get(src)
  const p = new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => { img.onerror = null; resolve(null) }
    img.src = src
  })
  cache.set(src, p)
  return p
}

export async function loadLogo(color) {
  const key = `logo:${color}`
  if (cache.has(key)) return cache.get(key)
  const p = fetch('/jbu-logo.svg').then((r) => r.text()).then((svg) => {
    const colored = svg.replace(/#6929c4/gi, color)
    return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(colored)}`)
  }).catch(() => null)
  cache.set(key, p)
  return p
}

export async function makeQR(url, theme) {
  const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 1200, errorCorrectionLevel: 'M', color: { dark: theme.qrDark, light: theme.qrLight } })
  return loadImage(dataUrl)
}

export function fontFamily() {
  if (typeof document === 'undefined') return 'IBM Plex Sans, Helvetica, Arial, sans-serif'
  return getComputedStyle(document.body).fontFamily || 'Helvetica, Arial, sans-serif'
}

/** Dibuja la obra completa dentro de la caja (sin recortar). Devuelve la escala aplicada respecto al tamaño original. */
function drawContain(ctx, img, x, y, w, h, frame) {
  if (frame) { ctx.fillStyle = frame; ctx.fillRect(x, y, w, h) }
  if (!img) return 0
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  return s
}

function fitText(ctx, text, maxW, size, weight, fam, minSize = 10) {
  let s = size
  ctx.font = `${weight} ${s}px ${fam}`
  while (s > minSize && ctx.measureText(text).width > maxW) { s -= Math.max(1, s * 0.05); ctx.font = `${weight} ${s}px ${fam}` }
  return s
}

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/)
  const lines = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w } else line = test
  }
  if (line) lines.push(line)
  return lines
}

/** Dibuja las obras en el área según el diseño. Devuelve la peor escala (para avisar de baja resolución). */
function drawArt(ctx, images, layout, x, y, w, h, theme, gap) {
  const imgs = images.filter(Boolean)
  if (!imgs.length) { ctx.fillStyle = theme.frame; ctx.fillRect(x, y, w, h); return 0 }
  let worst = Infinity
  const put = (img, ...box) => { const s = drawContain(ctx, img, ...box); if (s) worst = Math.min(worst, s) }
  if (layout === 'grid' && imgs.length > 1) {
    const n = Math.min(imgs.length, 6)
    const cols = n <= 2 ? n : n <= 4 ? 2 : 3
    const landscape = w > h * 1.3
    const c = landscape ? Math.min(n, n <= 3 ? n : 3) : cols
    const r = Math.ceil(n / c)
    const cw = (w - gap * (c - 1)) / c, rh = (h - gap * (r - 1)) / r
    imgs.slice(0, n).forEach((img, i) => put(img, x + (i % c) * (cw + gap), y + Math.floor(i / c) * (rh + gap), cw, rh, null))
  } else if ((layout === 'hero' || layout === 'collage') && imgs.length > 1) {
    const rest = imgs.slice(1, 5)
    const landscape = w > h * 1.3
    if (landscape) {
      const hw = w * 0.58
      put(imgs[0], x, y, hw, h, null)
      const sw = w - hw - gap
      const rows = Math.min(rest.length, 2), cols = Math.ceil(rest.length / rows)
      const cw = (sw - gap * (cols - 1)) / cols, rh = (h - gap * (rows - 1)) / rows
      rest.forEach((img, i) => put(img, x + hw + gap + Math.floor(i / rows) * (cw + gap), y + (i % rows) * (rh + gap), cw, rh, null))
    } else {
      const hh = h * 0.68
      put(imgs[0], x, y, w, hh, null)
      const cw = (w - gap * (rest.length - 1)) / rest.length
      rest.forEach((img, i) => put(img, x + i * (cw + gap), y + hh + gap, cw, h - hh - gap, null))
    }
  } else {
    put(imgs[0], x, y, w, h, null)
  }
  return worst === Infinity ? 0 : worst
}

/**
 * Compone la pieza. opts:
 *  target, lang, theme, layout ('single'|'hero'|'grid'|'minimal'|'split'), toggles, images[], logo, qr, status, W, H, safe(px), bleed(px), outdoor
 */
export function compose(ctx, opts) {
  if (opts.preset === 'clixmedia') return composeClixCTA(ctx, opts)
  const { target, lang, layout, toggles: tg, images, logo, qr, status, W, H } = opts
  const theme = THEMES[opts.theme] || THEMES.light
  const en = lang === 'en'
  const fam = fontFamily()
  const U = Math.min(W, H) / 1080
  const bleed = opts.bleed || 0
  const pad = (opts.safe ?? Math.round(Math.min(W, H) * 0.06)) + bleed
  ctx.save()
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'alphabetic'

  const landscape = W / H > 1.3
  const gap = Math.max(4, Math.round(Math.min(W, H) * 0.012))
  const isEvent = target.kind === 'EVENT'
  const e = target.event
  const lot = target.item?.auction
  const art = target.item?.artwork

  // Contenido textual según objetivo (Evento: sin una sola puja/reserva/ganador)
  const kicker = [
    !isEvent && tg.lotNumber && lot?.lot_number ? `${en ? 'LOT' : 'LOTE'} ${lotNo(lot.lot_number)}` : null,
    status ? (en ? status.en : status.es).toUpperCase() : null,
  ].filter(Boolean).join('  ·  ')
  const title = isEvent ? (tg.eventName ? e.name : '') : (tg.title ? (en ? art.title_en || art.title : art.title) : '')
  const lines = []
  if (isEvent) {
    if (tg.dates) lines.push(fmtDateRange(e.starts_at, e.last_close_at || e.closing_starts_at, lang))
    if (tg.lotCount) lines.push(`${e.lot_count ?? target.items.length} ${en ? (opts.outdoor ? 'ORIGINAL WORKS' : 'LOTS') : (opts.outdoor ? 'OBRAS ORIGINALES' : 'LOTES')}`)
    if (tg.openLine && ['LIVE', 'CLOSING'].includes(e.effective_status)) lines.push(en ? 'Bidding now open' : 'Pujas abiertas')
  } else {
    if (tg.eventName && target.event) lines.push(target.event.name)
    if (tg.dimensions && art.dimensions) lines.push(String(art.dimensions))
    if (tg.currentBid) lines.push(`${lot.current_bid ? (en ? 'Current bid' : 'Puja actual') : (en ? 'Starting bid' : 'Puja inicial')}  ${fmtMXN(lot.current_bid ?? lot.starting_bid)}`)
    if (tg.bidCount && Number(lot.bid_count) > 0) lines.push(`${lot.bid_count} ${en ? 'bids' : 'pujas'}`)
    if (tg.closeTime) lines.push(`${en ? 'Closes' : 'Cierra'} ${fmtClose(lot.ends_at, lang)}`)
  }
  const cta = isEvent ? (en ? 'VIEW AUCTION' : 'VER SUBASTA') : (en ? 'VIEW LOT' : 'VER LOTE')

  // Distribución: horizontal (espectaculares) → obra a un lado; vertical → obra arriba
  const minimal = layout === 'minimal'
  let artBox, textBox
  if (landscape) {
    const artW = (W - pad * 2) * (minimal ? 0.5 : layout === 'split' ? 0.55 : 0.6)
    artBox = [pad, pad, artW, H - pad * 2]
    textBox = [pad + artW + pad, pad, W - artW - pad * 3, H - pad * 2]
  } else {
    const textH = (H - pad * 2) * (minimal ? 0.34 : H / W > 1.6 ? 0.3 : 0.36)
    artBox = [pad, pad, W - pad * 2, H - pad * 2 - textH - pad * 0.6]
    textBox = [pad, H - pad - textH, W - pad * 2, textH]
  }
  const artLayout = isEvent && tg.artworks !== false ? (layout === 'split' ? 'grid' : layout) : 'single'
  const artImages = isEvent ? (tg.artworks === false ? images.slice(0, 1) : minimal ? images.slice(0, 1) : images) : images.slice(0, 1)
  const scale = drawArt(ctx, artImages, artLayout, ...artBox, theme, gap)

  // Texto
  const [tx, ty, tw, th] = textBox
  const qrSize = tg.qr && qr ? Math.min(th * (landscape ? 0.42 : 0.62), tw * (landscape ? 0.36 : 0.26)) : 0
  const textW = landscape ? (tg.logo && logo ? tw - th * 0.14 - pad * 0.4 : tw) : tw - (qrSize ? qrSize + pad * 0.5 : 0)
  let cy = ty + (landscape ? th * 0.04 : 0)
  const big = landscape ? th * 0.16 : 64 * U
  ctx.fillStyle = theme.accent
  if (kicker) {
    const ks = fitText(ctx, kicker, textW, Math.max(12, (landscape ? th * 0.05 : 24 * U)), 500, fam)
    cy += ks
    ctx.fillText(kicker, tx, cy)
    cy += ks * 0.9
  }
  if (title) {
    ctx.fillStyle = theme.ink
    let ts = big
    ctx.font = `300 ${ts}px ${fam}`
    let tl = wrap(ctx, title.toUpperCase(), textW)
    while (tl.length > (landscape ? 3 : 2) && ts > 14) { ts *= 0.9; ctx.font = `300 ${ts}px ${fam}`; tl = wrap(ctx, title.toUpperCase(), textW) }
    for (const l of tl) { cy += ts * 1.02; ctx.fillText(l, tx, cy) }
    cy += ts * 0.35
  }
  ctx.fillStyle = theme.ink
  const ls = landscape ? th * 0.065 : 30 * U
  ctx.font = `400 ${ls}px ${fam}`
  for (const l of lines) {
    const s = fitText(ctx, l, textW, ls, 400, fam)
    cy += s * 1.35
    ctx.fillText(l, tx, cy)
  }

  // Pie: CTA, sitio, logo, QR
  const footY = ty + th
  const fs = Math.max(11, landscape ? th * 0.045 : 22 * U)
  ctx.font = `500 ${fs}px ${fam}`
  let fy = footY
  if (tg.website) { ctx.fillStyle = theme.muted; ctx.fillText(SITE_LABEL, tx, fy); fy -= fs * 1.7 }
  if (!opts.outdoor && tg.cta !== false) { ctx.fillStyle = theme.accent; ctx.fillText(`${cta}  →`, tx, fy) }
  if (tg.logo && logo) {
    const lh = landscape ? th * 0.14 : 70 * U
    const lw = lh * (logo.naturalWidth / logo.naturalHeight || 0.9)
    const lx = qrSize && !landscape ? tx + tw - qrSize - pad * 0.5 - lw : tx + tw - lw
    const lyy = landscape ? ty : footY - lh
    if (!(landscape && qrSize)) ctx.drawImage(logo, lx, lyy, lw, lh)
    else ctx.drawImage(logo, tx + tw - lw, ty, lw, lh)
  }
  if (qrSize) {
    const qx = tx + tw - qrSize
    const qy = footY - qrSize
    ctx.drawImage(qr, qx, qy, qrSize, qrSize)
  }
  ctx.restore()
  return { scale }
}

/** Escala mínima aceptable: debajo de 0.5 la obra se ampliaría más de 2× → aviso de resolución. */
export const lowResolution = (scale) => scale > 2

/** Native 8:3 outdoor CTA: large isolated QR and a fully static final composition. */
export function composeClixCTA(ctx, opts) {
  const { target, logo, qr, W, H } = opts
  const theme = THEMES[opts.theme] || THEMES.light
  const fam = fontFamily(), pad = H * 0.075
  const qrSize = H - pad * 2, qrX = W - pad - qrSize
  const textW = qrX - pad * 2
  const title = target.event?.name || target.item?.artwork?.title || 'JBU AUCTION'
  ctx.save()
  ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'
  ctx.fillStyle = theme.ink
  let size = H * 0.12
  ctx.font = `300 ${size}px ${fam}`
  let lines = wrap(ctx, title.toUpperCase(), textW)
  while (size > 12 && (lines.length > 2 || lines.some((l) => ctx.measureText(l).width > textW))) {
    size *= 0.94; ctx.font = `300 ${size}px ${fam}`; lines = wrap(ctx, title.toUpperCase(), textW)
  }
  lines.slice(0, 2).forEach((line, i) => ctx.fillText(line, pad, pad + size + i * size * 1.16, textW))
  ctx.fillStyle = theme.accent
  fitText(ctx, 'BID ONLINE', textW, H * 0.15, 500, fam)
  ctx.fillText('BID ONLINE', pad, H * 0.60)
  ctx.fillStyle = theme.muted
  const logoH = H * 0.16
  const logoW = logo ? logoH * logo.naturalWidth / logo.naturalHeight : 0
  fitText(ctx, SITE_LABEL, textW - logoW - pad, H * 0.058, 400, fam)
  ctx.fillText(SITE_LABEL, pad, H - pad)
  if (logo && logoW) ctx.drawImage(logo, qrX - pad - logoW, H - pad - logoH, logoW, logoH)
  if (qr) { ctx.imageSmoothingEnabled = false; ctx.drawImage(qr, qrX, pad, qrSize, qrSize) }
  ctx.restore()
  return { scale: 0 }
}
