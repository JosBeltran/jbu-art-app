// Built-in outdoor presets are reusable without inserting rows on page load.
export const CLIXMEDIA = Object.freeze({
  id: 'clixmedia', kind: 'OUTDOOR_PRESET', label: 'CLIXMEDIA — 768×288',
  settings: Object.freeze({ format: 'clixmedia', layout: 'minimal', unit: 'px', px: true, pxW: 768, pxH: 288, safe: 4, bleed: 0 }),
  video: Object.freeze({ format: 'clixmedia', duration: 15, intro: 'gavel', transition: 'cut', introId: '', outroId: '', customDuration: false }),
})

export function clixTimeline(duration = 15) {
  if (!Number.isFinite(duration) || duration < 8 || duration > 120) throw new Error('CLIXMEDIA duration must be between 8 and 120 seconds.')
  const artSeconds = duration - 6
  return { introEnd: 2, firstEnd: 2 + artSeconds * 5 / 9, finalStart: duration - 4, total: duration }
}