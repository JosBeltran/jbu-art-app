// Video promocional automático: se dibuja en <canvas> y se graba con MediaRecorder en el navegador del admin.
import { THEMES, compose, fontFamily, loadImage } from './canvas'
import { lotNo } from './data'

export function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null
  return ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || null
}

const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3)

function contain(ctx, img, W, H, zoom = 1, dx = 0, alpha = 1, frame) {
  if (frame) { ctx.fillStyle = frame; ctx.fillRect(0, 0, W, H) }
  if (!img) return
  const w0 = img.naturalWidth || img.videoWidth, h0 = img.naturalHeight || img.videoHeight
  if (!w0 || !h0) return
  const pad = Math.min(W, H) * 0.08
  const s = Math.min((W - pad * 2) / w0, (H - pad * 2) / h0) * zoom
  const w = w0 * s, h = h0 * s
  ctx.globalAlpha = alpha
  ctx.drawImage(img, (W - w) / 2 + dx, (H - h) / 2, w, h)
  ctx.globalAlpha = 1
}

/** Mazo de subasta en trazo fino: sobrio, sin caricatura. t en [0,1]. */
function drawGavel(ctx, W, H, t, theme, label) {
  ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H)
  const U = Math.min(W, H) / 1080
  const cx = W / 2, cy = H / 2 + 60 * U
  const strike = 0.55
  const ang = t < strike ? -0.9 + 0.9 * ease(t / strike) : 0
  const shake = t >= strike && t < strike + 0.08 ? (1 - (t - strike) / 0.08) * 6 * U : 0
  ctx.save()
  ctx.translate(cx + 160 * U, cy - 40 * U + shake)
  ctx.rotate(ang)
  ctx.strokeStyle = theme.ink; ctx.lineWidth = 6 * U; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-300 * U, 0); ctx.stroke()                    // mango
  ctx.fillStyle = theme.ink
  ctx.fillRect(-380 * U, -55 * U, 120 * U, 110 * U)                                              // cabeza
  ctx.fillStyle = theme.accent
  ctx.fillRect(-380 * U, -8 * U, 120 * U, 16 * U)                                                // banda
  ctx.restore()
  ctx.fillStyle = theme.ink
  ctx.fillRect(cx - 280 * U, cy + 30 * U, 200 * U, 26 * U)                                       // base
  if (t >= strike) {
    const k = ease((t - strike) / (1 - strike))
    ctx.strokeStyle = theme.accent; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2 * U
    ctx.beginPath(); ctx.ellipse(cx - 180 * U, cy + 30 * U, (60 + 320 * k) * U, (12 + 60 * k) * U, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.globalAlpha = 1
  }
  if (label) {
    ctx.fillStyle = theme.ink
    ctx.font = `300 ${70 * U}px ${fontFamily()}`
    ctx.textAlign = 'center'
    ctx.globalAlpha = t > strike ? ease((t - strike) / 0.3) : 0
    ctx.fillText(label, W / 2, H * 0.2)
    ctx.globalAlpha = 1; ctx.textAlign = 'left'
  }
}

function drawTypo(ctx, W, H, t, theme, label, sub) {
  ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H)
  const U = Math.min(W, H) / 1080
  ctx.textAlign = 'center'
  ctx.fillStyle = theme.ink
  ctx.globalAlpha = ease(t * 1.6)
  ctx.font = `300 ${96 * U}px ${fontFamily()}`
  ctx.fillText(label, W / 2, H / 2)
  if (sub) { ctx.fillStyle = theme.accent; ctx.font = `500 ${28 * U}px ${fontFamily()}`; ctx.fillText(sub, W / 2, H / 2 + 70 * U) }
  ctx.fillStyle = theme.accent
  const lw = 240 * U * ease(t * 1.4)
  ctx.fillRect(W / 2 - lw / 2, H / 2 + 100 * U, lw, 2 * U)
  ctx.globalAlpha = 1; ctx.textAlign = 'left'
}

async function loadVideo(src) {
  if (!src) return null
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'; v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = src
    v.oncanplaythrough = () => { v.oncanplaythrough = null; resolve(v) }
    v.onerror = () => { v.onerror = null; resolve(null) }
    setTimeout(() => resolve(v.readyState >= 3 ? v : null), 15000)
  })
}

/**
 * Genera el video. opts: { target, lang, theme, W, H, duration (6|10), intro ('gavel'|'typo'|'detail'|'logo'|'custom'),
 *   transition ('fade'|'zoom'|'cut'|'slide'), introUrl, outroUrl, composeOpts (para el cuadro final), images[], logo, onProgress }
 */
export async function renderVideo(opts) {
  const mime = pickMime()
  if (!mime) throw new Error('MediaRecorder no disponible en este navegador')
  const { W, H, duration, target, lang, intro, transition } = opts
  const theme = THEMES[opts.theme] || THEMES.light
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  const imgs = (opts.images || []).filter(Boolean).slice(0, target.kind === 'EVENT' ? (duration >= 10 ? 3 : 5) : 1)
  const introVideo = intro === 'custom' ? await loadVideo(opts.introUrl) : null
  const outroVideo = opts.outroUrl ? await loadVideo(opts.outroUrl) : null
  const introLen = introVideo ? Math.min(introVideo.duration || 3, 4) : duration >= 10 ? 1.2 : 0.8
  const outroLen = outroVideo ? Math.min(outroVideo.duration || 3, 4) : 0
  const finalLen = duration >= 10 ? 3 : 2.4
  const artLen = Math.max(1.5, duration - 0.8 - finalLen) // 6 s: 0.8 + 2.8 + 2.4
  const titleLen = duration >= 10 && target.kind === 'EVENT' ? 1.5 : 0
  const total = introLen + titleLen + artLen + finalLen + outroLen
  const isEvent = target.kind === 'EVENT'
  const en = lang === 'en'
  const headline = isEvent ? (en ? 'LIVE AUCTION' : 'SUBASTA EN VIVO') : `${en ? 'LOT' : 'LOTE'} ${lotNo(target.item.auction.lot_number)}`
  const sub = isEvent ? 'JBU' : (en ? 'LIVE AUCTION' : 'SUBASTA EN VIVO')
  const detailImg = imgs[0]
  const logoBig = opts.logo

  // Cuadro final estático pre-renderizado (legible sin sonido)
  const finalCanvas = document.createElement('canvas')
  finalCanvas.width = W; finalCanvas.height = H
  compose(finalCanvas.getContext('2d'), { ...opts.composeOpts, W, H })

  const stream = canvas.captureStream(30)
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.min(16e6, Math.round(W * H * 30 * 0.12)) })
  const chunks = []
  rec.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data) }
  const done = new Promise((r) => { rec.onstop = r })

  const frame = (time) => {
    let t = time
    if (t < introLen) {
      const k = t / introLen
      if (introVideo) { contain(ctx, introVideo, W, H, 1, 0, 1, theme.bg) }
      else if (intro === 'typo') drawTypo(ctx, W, H, k, theme, headline, sub)
      else if (intro === 'detail' && detailImg) {
        ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H)
        // detalle: acercamiento suave sobre la obra completa (sin recortar la composición final)
        contain(ctx, detailImg, W, H, 1.6 - 0.5 * ease(k), 0, 1)
        drawTypo(ctx, W, H, 0, theme, '', '')
      } else if (intro === 'logo' && logoBig) {
        ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H)
        const s = Math.min(W, H) * 0.3
        ctx.globalAlpha = ease(k * 1.5)
        ctx.drawImage(logoBig, (W - s * 0.9) / 2, (H - s) / 2, s * 0.9, s)
        ctx.globalAlpha = 1
      } else drawGavel(ctx, W, H, k, theme, headline)
      return
    }
    t -= introLen
    if (t < titleLen) { drawTypo(ctx, W, H, t / titleLen, theme, target.event.name.toUpperCase(), `${target.event.lot_count} ${en ? 'LOTS' : 'LOTES'}`); return }
    t -= titleLen
    if (t < artLen) {
      const n = Math.max(1, imgs.length)
      const per = artLen / n
      const i = Math.min(n - 1, Math.floor(t / per))
      const k = (t - i * per) / per
      ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H)
      const img = imgs[i]
      if (transition === 'zoom') contain(ctx, img, W, H, 0.96 + 0.04 * k, 0, ease(k * 3))
      else if (transition === 'slide') contain(ctx, img, W, H, 1, (1 - ease(k * 2.5)) * W * 0.08, ease(k * 2.5))
      else if (transition === 'cut') contain(ctx, img, W, H, 1, 0, 1)
      else contain(ctx, img, W, H, 1, 0, Math.min(ease(k * 3), ease((1 - k) * 6) + (i === n - 1 ? 1 : 0)))
      if (!isEvent && opts.composeOpts?.toggles?.title && k > 0.3) {
        const U = Math.min(W, H) / 1080
        ctx.fillStyle = theme.ink; ctx.globalAlpha = ease((k - 0.3) * 3)
        ctx.font = `300 ${44 * U}px ${fontFamily()}`
        const a = target.item.artwork
        ctx.fillText((en ? a.title_en || a.title : a.title), Math.min(W, H) * 0.08, H - Math.min(W, H) * 0.06)
        ctx.globalAlpha = 1
      }
      return
    }
    t -= artLen
    if (t < finalLen) { ctx.globalAlpha = transition === 'cut' ? 1 : ease(t * 3); ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H); ctx.drawImage(finalCanvas, 0, 0); ctx.globalAlpha = 1; return }
    t -= finalLen
    if (outroVideo) contain(ctx, outroVideo, W, H, 1, 0, 1, theme.bg)
  }

  frame(0)
  rec.start(250)
  const t0 = performance.now()
  let introStarted = false, outroStarted = false
  await new Promise((resolve) => {
    const tick = () => {
      const s = (performance.now() - t0) / 1000
      if (introVideo && !introStarted) { introStarted = true; introVideo.currentTime = 0; introVideo.play().catch(() => {}) }
      if (outroVideo && !outroStarted && s >= total - outroLen) { outroStarted = true; outroVideo.currentTime = 0; outroVideo.play().catch(() => {}) }
      frame(Math.min(s, total - 0.001))
      opts.onProgress?.(Math.min(1, s / total))
      if (s >= total) resolve(); else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  rec.stop()
  await done
  introVideo?.pause(); outroVideo?.pause()
  return { blob: new Blob(chunks, { type: mime.split(';')[0] }), ext: mime.includes('mp4') ? 'mp4' : 'webm', seconds: total }
}

export { loadImage }
