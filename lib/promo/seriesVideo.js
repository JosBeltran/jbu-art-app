// Videos cortos de lanzamiento de Series: se dibujan en <canvas> y se graban con MediaRecorder.
import { fontFamily } from './canvas'
import { pickMime } from './video'
import { composeRelease, containBox, drawTypeBlock } from './seriesCanvas'

export const VIDEO_STYLES = ['typographic', 'reveal', 'drop']
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3)

/** Escenas por estilo, en fracciones de la duración. La última escena es siempre el cuadro final con CTA. */
export function videoTimeline(style, duration) {
  const end = duration >= 10 ? 3 : 2
  const body = duration - end
  if (style === 'typographic') return [{ k: 'word', a: 0, b: body * 0.45 }, { k: 'art', a: body * 0.45, b: body }, { k: 'final', a: body, b: duration }]
  if (style === 'reveal') return [{ k: 'detail', a: 0, b: body * 0.6 }, { k: 'title', a: body * 0.6, b: body }, { k: 'final', a: body, b: duration }]
  return [{ k: 'title', a: 0, b: body * 0.3 }, { k: 'art', a: body * 0.3, b: body * 0.65 }, { k: 'support', a: body * 0.65, b: body }, { k: 'final', a: body, b: duration }]
}

function word(ctx, W, H, theme, text, t, accent) {
  ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H)
  const U = Math.min(W, H) / 1080
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.globalAlpha = ease(t * 3)
  ctx.fillStyle = accent ? theme.accent : theme.ink
  ctx.font = `${accent ? 600 : 300} ${(accent ? 44 : 120) * U}px ${fontFamily()}`
  ctx.fillText(text, W / 2, H / 2 + (1 - ease(t * 3)) * 30 * U)
  ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
}

function frame(ctx, scene, p, o) {
  const { W, H, theme, copy, images, toggles } = o
  const U = Math.min(W, H) / 1080
  if (scene.k === 'final') return composeRelease(ctx, { ...o, toggles: { ...toggles, cta: true } })
  ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H)
  if (scene.k === 'word') {
    const words = [copy.label, copy.name, copy.line].filter(Boolean)
    const i = Math.min(words.length - 1, Math.floor(p * words.length))
    return word(ctx, W, H, theme, words[i], p * words.length - i, i !== 1)
  }
  if (scene.k === 'detail') return containBox(ctx, images[0], 0, 0, W, H, theme.frame, 1, 2.2 - 1.2 * ease(p))
  if (scene.k === 'title') return drawTypeBlock(ctx, { x: W * 0.08, y: H * 0.25, w: W * 0.84, U, theme, copy, toggles: { ...toggles, cta: false, description: false }, alpha: ease(p * 2) })
  if (scene.k === 'art') return containBox(ctx, images[0], 0, 0, W, H, theme.frame, ease(p * 2.5), 1 + 0.05 * p)
  if (scene.k === 'support') {
    const rest = images.slice(1, 4)
    if (!rest.length) return containBox(ctx, images[0], 0, 0, W, H, theme.frame, 1, 1.05)
    const i = Math.min(rest.length - 1, Math.floor(p * rest.length))
    containBox(ctx, rest[i], 0, 0, W, H, theme.frame, ease((p * rest.length - i) * 3))
  }
}

/** opts: { W, H, duration, style, theme, copy, images, toggles, logo, qr, onProgress } → Blob */
export async function renderSeriesVideo(opts) {
  const mime = pickMime()
  if (!mime) throw new Error('MediaRecorder no disponible en este navegador')
  const { W, H, duration, style, onProgress } = opts
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  const scenes = videoTimeline(style, duration)
  const stream = canvas.captureStream(30)
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
  const chunks = []
  rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data) }
  const done = new Promise((r) => { rec.onstop = r })
  rec.start(250)
  const t0 = performance.now()
  await new Promise((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000
      const s = scenes.find((x) => t < x.b) || scenes[scenes.length - 1]
      frame(ctx, s, Math.min(1, (t - s.a) / Math.max(0.001, s.b - s.a)), opts)
      onProgress?.(Math.min(1, t / duration))
      if (t >= duration) resolve(); else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  rec.stop(); await done
  return new Blob(chunks, { type: mime.split(';')[0] })
}
