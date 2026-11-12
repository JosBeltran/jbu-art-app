/**
 * Isolated real-component Chromium regression; no live auth/promo/API calls.
 * JBU_BROWSER_TOOLS=/path/to/tools node tests/welcomePromoLifecycle.browser.mjs
 * Optional JBU_CHROMIUM_PATH, JBU_PLAYWRIGHT_MODULE, JBU_PROMO_SOURCE_REF,
 * JBU_PROMO_EVIDENCE=/path/report.json. See evidence/PROMO_LIFECYCLE.md.
 */
import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import http from 'node:http'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(process.env.JBU_BROWSER_TOOLS
  ? path.join(process.env.JBU_BROWSER_TOOLS, 'package.json') : import.meta.url)
const { build } = require('esbuild')
const { chromium } = require(process.env.JBU_PLAYWRIGHT_MODULE || 'playwright')
const ref = process.env.JBU_PROMO_SOURCE_REF
const component = path.join(root, 'components/promo/WelcomePromoModal.jsx')
const evidence = { source: ref || 'working tree', matrix: [], method: 'actual component/CSS, mocked router/data; not authenticated or WCAG acceptance' }
let scratch, server, browser, origin

before(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), 'jbu-promo-lifecycle-'))
  await build({
    entryPoints: [path.join(root, 'tests/fixtures/welcomePromoLifecycle.jsx')],
    bundle: true, outfile: path.join(scratch, 'bundle.js'), jsx: 'automatic',
    nodePaths: [path.join(root, 'node_modules')],
    plugins: [{ name: 'isolated-promo-boundaries', setup(builder) {
      if (ref) builder.onLoad({ filter: /WelcomePromoModal\.jsx$/ }, () => ({
        contents: execFileSync('git', ['show', ref + ':components/promo/WelcomePromoModal.jsx'], { cwd: root, encoding: 'utf8' }),
        loader: 'jsx', resolveDir: path.dirname(component),
      }))
      builder.onResolve({ filter: /^(next\/navigation|@\/components\/jbu\/LogoJBU|@\/components\/I18nProvider|@\/lib\/artworks)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents:
        args.path === 'next/navigation' ? 'export function useRouter(){return {push(path){window.promoFixture.destination=path;window.promoFixture.unmount()}}}' :
        args.path.includes('I18nProvider') ? 'export function useI18n(){return {t:(es,en)=>en}}' :
        args.path.includes('LogoJBU') ? 'export default function Logo(){return null}' :
        'export function getArtworks(){window.promoFixture.imageReads++;return new Promise(resolve=>{window.promoFixture.imageReady=resolve})}',
      }))
    } }],
  })
  const globals = (await readFile(path.join(root, 'app/globals.css'), 'utf8')).replace(/@import[^;]+;/g, '')
  const carbon = await readFile(path.join(root, 'node_modules/@carbon/styles/css/styles.css'), 'utf8')
  await writeFile(path.join(scratch, 'index.html'), `<html><head><style>${carbon}\n${globals}</style><link rel="stylesheet" href="/bundle.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`)
  server = http.createServer(async (request, response) => {
    const file = { '/': 'index.html', '/bundle.js': 'bundle.js', '/bundle.css': 'bundle.css' }[request.url]
    if (!file) { response.writeHead(404).end(); return }
    response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html')
    response.end(await readFile(path.join(scratch, file)))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = 'http://127.0.0.1:' + server.address().port
  browser = await chromium.launch({ headless: true, ...(process.env.JBU_CHROMIUM_PATH ? { executablePath: process.env.JBU_CHROMIUM_PATH } : {}) })
})

after(async () => {
  if (process.env.JBU_PROMO_EVIDENCE) {
    await mkdir(path.dirname(process.env.JBU_PROMO_EVIDENCE), { recursive: true })
    await writeFile(process.env.JBU_PROMO_EVIDENCE, JSON.stringify(evidence, null, 2) + '\n')
  }
  await browser?.close()
  if (server) await new Promise(resolve => server.close(resolve))
  if (scratch) await rm(scratch, { recursive: true, force: true })
})

async function open(page, theme) {
  await page.goto(origin)
  await page.waitForFunction(() => window.promoFixture?.ready)
  await page.evaluate(dark => {
    document.documentElement.classList.toggle('jbu-dark', dark)
    document.getElementById('root').classList.add(dark ? 'cds--g100' : 'cds--g10')
    document.body.style.overflow = 'auto'
    document.getElementById('before').focus()
  }, theme === 'dark')
  // Wait for the async config and its scroll effect before dispatching scroll.
  await page.waitForFunction(() => window.promoFixture.promoReads > 0)
  await page.waitForTimeout(50)
  await page.evaluate(() => { scrollTo(0, 1000); window.dispatchEvent(new Event('scroll')) })
  await page.getByRole('dialog').waitFor()
  await page.waitForFunction(() => window.promoFixture.keyListeners() === 1)
}
async function released(page, focusTarget = 'before') {
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'))
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'auto', 'restore previous overflow')
  assert.equal(await page.evaluate(() => window.promoFixture.keyListeners()), 0, 'remove keydown listener')
  if (focusTarget) assert.equal(await page.evaluate(() => document.activeElement.id), focusTarget, 'restore connected focus target')
  const prevented = await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })
  assert.equal(prevented, false, 'invisible dialog never prevents Tab')
  await page.locator('#after').focus()
  await page.keyboard.press('Shift+Tab')
  if (focusTarget) assert.equal(await page.evaluate(() => document.activeElement.id), 'before', 'normal reverse navigation')
  if (focusTarget) {
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'after', 'normal forward navigation')
  }
}
const cases = {
  async 'guest focus wrapping and Escape'(page) {
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Close promotion')
    await page.keyboard.press('Shift+Tab')
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), '/info/politica-de-privacidad')
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Close promotion')
    await page.keyboard.press('Escape')
    await released(page)
    assert.equal(await page.evaluate(() => Number(localStorage.getItem('jbu-welcome-promo-dismissed')) > 0), true)
  },
  async 'close button dismissal'(page) {
    await page.getByRole('button', { name: 'Close promotion' }).click()
    await released(page)
  },
  async 'sign-in cleanup and subsequent sign-out'(page) {
    await page.evaluate(() => window.promoFixture.session({ user: { id: 'fixture' } }))
    await released(page)
    assert.equal(await page.evaluate(() => localStorage.getItem('jbu-welcome-promo-dismissed')), null, 'sign-in is not a persistent promo dismissal')
    assert.equal(await page.evaluate(() => sessionStorage.getItem('jbu-welcome-promo-dismissed')), '1')
    await page.evaluate(() => window.promoFixture.session(null))
    await page.waitForTimeout(50)
    await page.evaluate(() => window.dispatchEvent(new Event('scroll')))
    await released(page, null)
    assert.equal(await page.evaluate(() => window.promoFixture.imageReads), 1, 'no hidden/reopened image request')
    await page.evaluate(() => window.promoFixture.imageReady([{ featured: true, primary_image_url: '/late-image.png' }]))
    await page.waitForTimeout(20)
    assert.equal(await page.getByRole('dialog').count(), 0)
    const stored = await page.evaluate(() => localStorage.getItem('jbu-welcome-promo-dismissed'))
    await page.keyboard.press('Escape')
    assert.equal(await page.evaluate(() => localStorage.getItem('jbu-welcome-promo-dismissed')), stored, 'hidden Escape does not persist dismissal')
    // Remounting/reloading in the same tab must also respect displayed state.
    await page.reload()
    await page.waitForFunction(() => window.promoFixture?.ready)
    await page.evaluate(() => window.dispatchEvent(new Event('scroll')))
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert.equal(await page.evaluate(() => window.promoFixture.promoReads), 0)
  },
  async 'sign-in releases normal Tab navigation'(page) {
    await page.evaluate(() => window.promoFixture.session({ user: { id: 'fixture' } }))
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'))
    await page.locator('#before').focus()
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'after', 'Tab remains usable after sign-in')
    await page.keyboard.press('Shift+Tab')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'before')
  },
  async 'sign-out never revives a displayed promotion'(page) {
    await page.evaluate(() => window.promoFixture.session({ user: { id: 'fixture' } }))
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'))
    await page.evaluate(() => window.promoFixture.session(null))
    await page.waitForTimeout(50)
    assert.equal(await page.getByRole('dialog').count(), 0, 'sign-out must not revive consumed open state')
    await page.evaluate(() => window.dispatchEvent(new Event('scroll')))
    await released(page, null)
  },
  async 'removed focus target during sign-in'(page) {
    await page.evaluate(() => {
      const original = document.getElementById('before')
      original.focus = () => { throw new Error('Attempted to focus removed original') }
      original.remove()
      window.promoFixture.session({ user: { id: 'fixture' } })
    })
    await released(page, null)
  },
  async 'unmount while open'(page) {
    await page.evaluate(() => window.promoFixture.unmount())
    await released(page)
    await page.evaluate(() => window.promoFixture.imageReady([]))
  },
  async 'detached dialog cannot intercept keyboard'(page) {
    await page.evaluate(() => document.querySelector('[role="dialog"]').remove())
    await page.locator('#before').focus()
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'after', 'detached dialog must not cancel Tab')
  },
  async 'failed submissions retain eligibility and payload'(page) {
    for (const status of ['INVALID_EMAIL', 'NOT_ELIGIBLE', 'REDEEMED', 'UNAVAILABLE', 'NETWORK_ERROR']) {
      await page.getByLabel('Email address').fill('fixture@example.test')
      await page.evaluate(value => { window.promoFixture.response = value === 'NETWORK_ERROR' ? value : { status: value } }, status)
      const button = page.getByRole('button', { name: 'Unlock my 10%' })
      await button.click()
      await page.waitForFunction(() => Boolean(window.promoFixture.responseReady))
      assert.equal(await page.getByRole('button', { name: 'Processing…' }).isDisabled(), true)
      await page.evaluate(() => { window.promoFixture.responseReady(); window.promoFixture.responseReady = null })
      await page.getByRole('alert').waitFor()
      assert.ok((await page.getByRole('alert').textContent()).length > 0)
      assert.equal(await button.isEnabled(), true)
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden')
    }
    assert.deepEqual(await page.evaluate(() => window.promoFixture.submissions), Array(5).fill({ email: 'fixture@example.test' }))
    assert.equal(await page.evaluate(() => localStorage.getItem('jbu-welcome-promo-dismissed')), null)
    await page.keyboard.press('Escape')
    await released(page)
  },
  async 'success and router unmount'(page) {
    await page.getByLabel('Email address').fill('fixture@example.test')
    await page.evaluate(() => { window.promoFixture.response = { status: 'CLAIMED' } })
    await page.getByRole('button', { name: 'Unlock my 10%' }).click()
    await page.waitForFunction(() => Boolean(window.promoFixture.responseReady))
    await page.evaluate(() => window.promoFixture.responseReady())
    await page.getByRole('button', { name: 'Explore original art' }).waitFor()
    assert.deepEqual(await page.evaluate(() => window.promoFixture.submissions), [{ email: 'fixture@example.test' }])
    assert.equal(await page.evaluate(() => Number(localStorage.getItem('jbu-welcome-promo-dismissed')) > 0), true)
    await page.getByRole('button', { name: 'Explore original art' }).click()
    await released(page)
    assert.equal(await page.evaluate(() => window.promoFixture.destination), '/catalog')
  },
}

for (const theme of ['light', 'dark']) for (const width of [375, 1440]) {
  for (const [name, run] of Object.entries(cases)) test(`${theme} ${width}: ${name}`, { timeout: 15000 }, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const row = { theme, width, case: name }
    try {
      await open(page, theme)
      await run(page)
      assert.deepEqual(errors, [], 'no page errors')
      row.result = 'pass'
    } catch (error) {
      row.result = 'fail'; row.error = error.message
      row.observed = await page.evaluate(() => {
        const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
        window.dispatchEvent(event)
        return { dialog: Boolean(document.querySelector('[role="dialog"]')), overflow: document.body.style.overflow,
          keyListeners: window.promoFixture.keyListeners(), tabPrevented: event.defaultPrevented,
          focus: document.activeElement.id || document.activeElement.tagName }
      })
      throw error
    } finally {
      evidence.matrix.push(row)
      await context.close()
    }
  })
}
