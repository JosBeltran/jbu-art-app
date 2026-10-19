// Composición de piezas de lanzamiento de Series en <canvas>.
// Igual que el resto de promo: las obras se muestran completas ("contain"), sin recortar ni alterar color.
import { fontFamily } from './canvas'

export const SERIES_FORMATS = {
  feed: { w: 1080, h: 1350, group: 'social', es: 'Feed 4:5', en: 'Feed 4:5' },
  square: { w: 1080, h: 1080, group: 'social', es: 'Cuadrado 1:1', en: 'Square 1:1' },
  story: { w: 1080, h: 1920, group: 'social', es: 'Historia 9:16', en: 'Story 9:16' },
  hero: { w: 1920, h: 800, group: 'web', es: 'Banner web', en: 'Web hero banner' },
  tile: { w: 1200, h: 1200, group: 'web', es: 'Tarjeta promo', en: 'Promo tile' },
  email: { w: 1200, h: 480, group: 'web', es: 'Encabezado de correo', en: 'Email header' },
  poster: { w: 3600, h: 5400, group: 'outdoor', es: 'Póster 24×36 in', en: 'Poster 24×36 in' },
  billboard: { w: 4800, h: 1400, group: 'outdoor', es: 'Espectacular estático', en: 'Static billboard' },
  clixmedia: { w: 768, h: 288, group: 'outdoor', es: 'CLIXMEDIA 768×288', en: 'CLIXMEDIA 768×288' },
  vstory: { w: 1080, h: 1920, group: 'video', es: 'Video vertical', en: 'Story / reel video' },
  vland: { w: 1920, h: 1080, group: 'video', es: 'Video horizontal', en: 'Landscape video' },
}

export const SERIES_THEMES = {
  light: { bg: '#f4f2ee', ink: '#111111', muted: '#6f6f6f', accent: '#6929c4', frame: '#e9e5ef', qrDark: '#111111', qrLight: '#f4f2ee' },
  dark: { bg: '#0d0d0d', ink: '#f4f4f4', muted: '#9a9a9a', accent: '#be95ff', frame: '#1a171f', qrDark: '#0d0d0d', qrLight: '#f4f4f4' },
}

export function containBox(ctx, img, x, y, w, h, frame, alpha = 1, zoom = 1) {
  if (frame) { ctx.fillStyle = frame; ctx.fillRect(x, y, w, h) }
  if (!img) return
  const w0 = img.naturalWidth || img.videoWidth, h0 = img.naturalHeight || img.videoHeight
  if (!w0 || !h0) return
  const pad = Math.min(w, h) * 0.04
  const s = Math.min((w - pad * 2) / w0, (h - pad * 2) / h0) * zoom
  const dw = w0 * s, dh = h0 * s
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
  ctx.globalAlpha = alpha
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  ctx.restore()
}

function fitText(ctx, text, maxW, size, weight, minSize) {
  let s = size
  ctx.font = `${weight} ${s}px ${fontFamily()}`
  while (s > minSize && ctx.measureText(text).width > maxW) { s -= 2; ctx.font = `${weight} ${s}px ${fontFamily()}` }
  return s
}

function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []; let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (ctx.measureText(next).width > maxW && cur) { lines.push(cur); cur = w } else cur = next
  }
  if (cur) lines.push(cur)
  return lines
}

/** Bloque tipográfico de lanzamiento. Devuelve la altura usada. */
export function drawTypeBlock(ctx, { x, y, w, U, theme, copy, toggles, big = 1, alpha = 1 }) {
  ctx.globalAlpha = alpha
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  let cy = y
  ctx.fillStyle = theme.accent
  ctx.font = `600 ${22 * U}px ${fontFamily()}`
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = `${4 * U}px`
  ctx.fillText(copy.label, x, cy + 22 * U); cy += 22 * U + 28 * U
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px'
  ctx.fillRect(x, cy, 56 * U, 3 * U); cy += 3 * U + 36 * U
  if (toggles.title) {
    ctx.fillStyle = theme.ink
    const size = fitText(ctx, copy.name.split(/\s+/).sort((a, b) => b.length - a.length)[0] || '', w, 132 * U * big, 300, 40 * U)
    ctx.font = `300 ${size}px ${fontFamily()}`
    for (const line of wrap(ctx, copy.name, w).slice(0, 3)) { cy += size * 0.92; ctx.fillText(line, x, cy) }
    cy += 26 * U
  }
  ctx.fillStyle = theme.ink
  const rows = []
  if (toggles.subtitle && copy.subtitle) rows.push([copy.subtitle, 400, 30])
  rows.push([copy.line, 400, 26])
  if (toggles.description && copy.short) rows.push([copy.short, 300, 24])
  for (const [text, weight, size] of rows) {
    ctx.font = `${weight} ${size * U}px ${fontFamily()}`
    ctx.fillStyle = weight === 300 ? theme.muted : theme.ink
    for (const line of wrap(ctx, text, w).slice(0, 3)) { cy += size * U * 1.35; ctx.fillText(line, x, cy) }
    cy += 8 * U
  }
  const meta = [toggles.works && copy.works, toggles.date && copy.date && copy.line !== copy.date && copy.date, copy.note].filter(Boolean)
  if (meta.length) {
    ctx.fillStyle = theme.muted; ctx.font = `500 ${20 * U}px ${fontFamily()}`
    cy += 12 * U
    for (const m of meta) { cy += 30 * U; ctx.fillText(m, x, cy) }
  }
  if (toggles.cta) {
    cy += 40 * U
    ctx.fillStyle = theme.ink; ctx.font = `600 ${22 * U}px ${fontFamily()}`
    ctx.fillText(`${copy.cta}  →`, x, cy)
  }
  ctx.globalAlpha = 1
  return cy - y
}

function drawFooter(ctx, { W, H, U, M, theme, copy, toggles, logo, qr }) {
  const base = H - M
  if (toggles.logo && logo) { const s = 56 * U; ctx.drawImage(logo, M, base - s, s, s) }
  if (toggles.website) {
    ctx.fillStyle = theme.muted; ctx.font = `500 ${20 * U}px ${fontFamily()}`
    ctx.textAlign = 'left'
    ctx.fillText(copy.site, M + (toggles.logo && logo ? 76 * U : 0), base - 18 * U)
  }
  if (toggles.qr && qr) {
    const s = Math.min(170 * U, H * 0.3)
    ctx.fillStyle = theme.qrLight; ctx.fillRect(W - M - s, base - s, s, s)
    ctx.drawImage(qr, W - M - s, base - s, s, s)
  }
}

/**
 * Dibuja una pieza completa.
 * opts: { W, H, theme, copy, images (ya ordenadas), mode: hero|grid|typo, toggles, logo, qr }
 */
export function composeRelease(ctx, opts) {
  const { W, H, theme, copy, images, mode, toggles, logo, qr } = opts
  const U = Math.min(W, H) / 1080 * (W / H > 2.2 ? 1.25 : 1)
  const M = Math.round(Math.min(W, H) * 0.07)
  ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H)
  const imgs = (toggles.multiple ? images : images.slice(0, 1)).filter(Boolean)
  const wide = W / H > 1.3
  const footerH = 90 * U

  if (mode === 'typo' || !imgs.length) {
    const tw = wide ? W * 0.62 : W - M * 2
    drawTypeBlock(ctx, { x: M, y: M, w: tw, U, theme, copy, toggles, big: 1.2 })
    if (imgs[0] && wide) containBox(ctx, imgs[0], W * 0.7, M, W * 0.3 - M, H - M * 2 - footerH, null, 0.95)
    else if (imgs[0]) containBox(ctx, imgs[0], W * 0.52, H * 0.56, W * 0.48 - M, H * 0.44 - M - footerH, null, 0.95)
  } else if (mode === 'grid') {
    const n = Math.min(imgs.length, 4)
    if (wide) {
      const textW = W * 0.34
      drawTypeBlock(ctx, { x: M, y: M, w: textW - M, U, theme, copy, toggles })
      const gx = textW + M * 0.5, gw = W - gx - M, gh = H - M * 2 - footerH * 0.2
      const cell = (gw - (n - 1) * 12 * U) / n
      imgs.slice(0, n).forEach((img, i) => containBox(ctx, img, gx + i * (cell + 12 * U), M, cell, gh, theme.frame))
    } else {
      const gy = M, gh = H * 0.5
      const cols = n === 1 ? 1 : 2, rowsN = Math.ceil(n / cols)
      const cw = (W - M * 2 - (cols - 1) * 12 * U) / cols, ch = (gh - (rowsN - 1) * 12 * U) / rowsN
      imgs.slice(0, n).forEach((img, i) => containBox(ctx, img, M + (i % cols) * (cw + 12 * U), gy + Math.floor(i / cols) * (ch + 12 * U), cw, ch, theme.frame))
      drawTypeBlock(ctx, { x: M, y: gy + gh + 40 * U, w: W - M * 2, U, theme, copy, toggles, big: 0.75 })
    }
  } else {
    if (wide) {
      containBox(ctx, imgs[0], W * 0.42, 0, W * 0.58, H, theme.frame)
      drawTypeBlock(ctx, { x: M, y: M, w: W * 0.42 - M * 1.5, U, theme, copy, toggles })
    } else {
      const ih = H * (H / W > 1.5 ? 0.56 : 0.5)
      containBox(ctx, imgs[0], 0, 0, W, ih, theme.frame)
      drawTypeBlock(ctx, { x: M, y: ih + 44 * U, w: W - M * 2, U, theme, copy, toggles, big: 0.8 })
    }
  }
  drawFooter(ctx, { W, H, U, M, theme, copy, toggles, logo, qr })
}
