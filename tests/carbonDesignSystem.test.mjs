import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('application keeps Carbon Theme g10/g100 and light as fallback', () => {
  const shell = read('app/ClientLayout.jsx')
  const provider = read('components/AppThemeProvider.jsx')
  const layout = read('app/layout.tsx')
  assert.match(shell, /<Theme\s+theme=\{dark\s*\?\s*'g100'\s*:\s*'g10'\}/)
  assert.match(provider, /initialDark\s*=\s*false/)
  assert.match(layout, /get\("jbu-theme"\)\?\.value\s*===\s*"dark"/)
})

test('hero uses active palette instead of an unconditional dark background', () => {
  const css = read('app/landing/Landing.module.css')
  assert.match(css, /\.page\s+\.hero\s*\{\s*background:\s*var\(--landing-bg\)/)
  assert.match(css, /\.page\s+\.heroShade\s*\{[\s\S]*?var\(--landing-bg\)/)
})

test('social share preview uses theme tokens rather than fixed background/warning text colors', () => {
  const css = read('components/admin/PromotionalSocialEditor.module.css')
  const image = css.match(/\.previewImage\s*\{([^}]*)\}/)?.[1] || ''
  const warning = css.match(/\.warning\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(image, /background:\s*var\(--cds-layer-01\)/)
  assert.doesNotMatch(image, /background:\s*#[\da-f]+/i)
  assert.match(warning, /color:\s*var\(--cds-text-primary\)/)
})

test('Carbon IBM Plex and scoped brand tokens remain the source of truth', () => {
  const root = read('app/globals.css')
  const layout = read('app/layout.tsx')
  assert.match(layout, /IBM_Plex_Sans/)
  assert.match(layout, /IBM_Plex_Serif/)
  assert.match(layout, /IBM_Plex_Mono/)
  assert.match(root, /--jbu-purple:\s*#6929c4/)
  assert.match(root, /\.jbu-dark\s*\{/)
})

test('custom welcome promotional dialog preserves keyboard focus containment and return', () => {
  const source = read('components/promo/WelcomePromoModal.jsx')
  assert.match(source, /ref=\{dialogRef\}/)
  assert.match(source, /e\.key === 'Escape'/)
  assert.match(source, /e\.key !== 'Tab'/)
  assert.match(source, /previousFocus\?\.focus\?\.\(\)/)
  assert.match(source, /aria-modal="true"/)
})
