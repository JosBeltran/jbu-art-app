import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import http from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import sharp from 'sharp'
import { INVENTORY_PREFERENCE_KEY, inventoryReturnPath, parseInventoryPreferences } from '../lib/adminArtworkInventory.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(path.join(process.env.JBU_BROWSER_TOOLS || root, 'package.json'))
const { build } = require('esbuild')
const { chromium } = require('playwright')
const baseline = process.env.JBU_INVENTORY_BASELINE
const labels = { series: ['Orbitals', 'Tides'], version: ['current', 'historical'], availability: ['AVAILABLE', 'SOLD'] }
const seed = JSON.parse(await readFile(path.join(root, 'artworks_seed.json'), 'utf8'))
const rows = Array.from({ length: 750 }, (_, index) => {
  const n = index + 1
  const asset = '/' + seed[index % seed.length].Image
  return {
    id: '00000000-0000-4000-8000-' + String(n).padStart(12, '0'),
    title: 'Obra ' + n, title_en: 'Artwork ' + n,
    sku: 'INV-' + String(n).padStart(4, '0'), series: labels.series[n % 2], year: 2025 + n % 2,
    price: n * 10, status: 'AVAILABLE', availability: n % 10 === 0 ? 'SOLD' : 'AVAILABLE',
    ownership_status: n % 10 === 0 ? 'SOLD' : 'AVAILABLE',
    version: n % 10 === 0 ? 'historical' : 'current',
    edition: 'UNIQUE', public: true, created_at: String(n).padStart(4, '0'),
    primary_image_url: n === 749 ? null : asset,
    thumbnails: n === 749 ? [] : [asset],
    description: 'Full description from the baseline projection. '.repeat(36),
  }
})
const userId = '00000000-0000-4000-8000-000000000001'
const requests = []
const assetCache = new Map()
let scratch, server, browser, origin

before(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), 'jbu-inventory-'))
  const entry = `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import Inventory from '@/app/admin/artworks/page.jsx'
    import { I18nProvider } from '@/components/I18nProvider'
    createRoot(document.getElementById('root')).render(<I18nProvider><Inventory /></I18nProvider>)
  `
  const sourceFile = path.join(root, 'app/admin/artworks/page.jsx')
  const mocks = {
    'next/link': `export default function Link({prefetch, ...props}) { return <a {...props}/> }`,
    'next/navigation': `
      import { useSyncExternalStore } from 'react'
      const replace = window.history.replaceState.bind(window.history)
      window.history.replaceState = (...args) => {
        replace(...args)
        window.dispatchEvent(new Event('popstate'))
      }
      const subscribe = listener => {
        window.addEventListener('popstate', listener)
        return () => window.removeEventListener('popstate', listener)
      }
      const router = {}
      export const useRouter = () => router
      export function useSearchParams() {
        return new URLSearchParams(useSyncExternalStore(subscribe, () => location.search))
      }
    `,
    '@/lib/authHeaders': `export const authHeaders = async () => ({
      Authorization: 'Bearer fixture',
      'X-Fixture-Preferences': encodeURIComponent(localStorage.getItem('fixture-account-metadata') || 'null'),
    })`,
    '@/lib/supabaseClient': `
      function metadata() {
        return JSON.parse(localStorage.getItem('fixture-account-metadata') || '{"jbu_currency":"USD"}')
      }
      export const supabase = {
        auth: {
          getUser: async () => ({ data: { user: { id: '${userId}', user_metadata: metadata() } } }),
          updateUser: async ({ data }) => {
            localStorage.setItem('fixture-account-metadata', JSON.stringify({ ...metadata(), ...data }))
            return { error: null }
          },
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        },
        from: () => ({ select: () => ({ order: () => fetch('/legacy-data').then(response => response.json()) }) }),
      }
    `,
  }
  async function bundle(name, ref) {
    await build({
      stdin: { contents: entry, loader: 'jsx', resolveDir: root }, bundle: true, jsx: 'automatic',
      alias: { '@': root }, loader: { '.module.css': 'local-css' }, outfile: path.join(scratch, name + '.js'),
      plugins: [{
        name: 'inventory-fixture',
        setup(builder) {
          builder.onResolve({ filter: /^(next\/|@\/)/ }, args => mocks[args.path] ? { path: args.path, namespace: 'fixture' } : undefined)
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'jsx', resolveDir: root }))
          if (ref) builder.onLoad({ filter: /(?:page\.jsx|ArtworksList\.module\.css)$/ }, args => {
            if (args.path !== sourceFile && args.path !== path.join(path.dirname(sourceFile), 'ArtworksList.module.css')) return
            const relative = path.relative(root, args.path)
            return { contents: execFileSync('git', ['show', ref + ':' + relative], { cwd: root, encoding: 'utf8' }),
              loader: relative.endsWith('.css') ? 'local-css' : 'jsx', resolveDir: path.dirname(sourceFile) }
          })
        },
      }],
    })
  }
  await bundle('inventory')
  if (baseline) await bundle('baseline', baseline)
  const carbon = await readFile(path.join(root, 'node_modules/@carbon/styles/css/styles.css'), 'utf8')
  server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost')
      const send = (data, status = 200) => {
        response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        response.end(JSON.stringify(data))
      }
      if (url.pathname === '/legacy-data') return send({ data: rows.toReversed().map(({ thumbnails, ...row }) => row) })
      if (url.pathname === '/api/admin/artworks/inventory') {
        if (request.headers.authorization !== 'Bearer fixture') return send({ error: 'forbidden' }, 403)
        if (request.method === 'POST') {
          let body = ''
          for await (const chunk of request) body += chunk
          const params = JSON.parse(body)
          requests.push(params)
          return send({ results: params.ids.map(id => ({ id, outcome: params.apply ? 'successful' : 'eligible' })) })
        }
        const query = url.searchParams
        requests.push(query.toString())
        const search = query.get('q')?.toLowerCase() || ''
        const filtered = rows.filter(row =>
          [row.title, row.title_en, row.sku, row.series].some(value => value.toLowerCase().includes(search)) &&
          Object.keys(labels).every(key => !query.has(key) || query.getAll(key).includes(row[key])))
        const sort = query.get('sort')
        const direction = query.get('dir') === 'asc' ? 1 : -1
        filtered.sort((a, b) => String(a[sort] ?? '').localeCompare(String(b[sort] ?? '')) * direction)
        const size = Number(query.get('size'))
        const offset = (Number(query.get('page')) - 1) * size
        const page = filtered.slice(offset, offset + size).map(({ description, primary_image_url, ...row }) => row)
        return send({ total: filtered.length, rows: page, administrator: userId, facets: query.has('facets') ? labels : null,
          preferences: parseInventoryPreferences(JSON.parse(decodeURIComponent(request.headers['x-fixture-preferences'] || 'null'))?.[INVENTORY_PREFERENCE_KEY]) })
      }
      if (url.pathname.startsWith('/assets-optimized/') || url.pathname === '/_next/image') {
        const source = url.pathname === '/_next/image' ? url.searchParams.get('url') : decodeURIComponent(url.pathname)
        const width = Number(url.searchParams.get('w'))
        if (!source?.startsWith('/assets-optimized/artworks/') || source.includes('..')) return response.writeHead(404).end()
        let image = assetCache.get(url.href)
        if (!image) {
          image = await readFile(path.join(root, 'public', source))
          if (width) image = await sharp(image).resize({ width, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer()
          assetCache.set(url.href, image)
        }
        return response.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000' }).end(image)
      }
      if (url.pathname === '/carbon.css') return response.writeHead(200, { 'Content-Type': 'text/css' }).end(carbon)
      if (/^\/(inventory|baseline)\.(js|css)$/.test(url.pathname)) {
        response.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css')
        return response.end(await readFile(path.join(scratch, url.pathname.slice(1))))
      }
      if (/\/edit$/.test(url.pathname)) {
        const returnPath = inventoryReturnPath(url.searchParams.get('inventory')).replaceAll('&', '&amp;').replaceAll('"', '&quot;')
        return response.writeHead(200, { 'Content-Type': 'text/html' }).end('<a href="' + returnPath + '">Return to inventory</a>')
      }
      if (url.pathname !== '/admin/artworks') return response.writeHead(404).end()
      const variant = queryVariant(url)
      return response.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="/carbon.css"><link rel="stylesheet" href="/${variant}.css">
        <body data-carbon-theme="g100" style="background:#161616;color:white"><div id="root"></div><script src="/${variant}.js"></script>`)
    } catch {
      response.writeHead(404).end()
    }
  })
  function queryVariant(url) { return baseline && url.searchParams.has('baseline') ? 'baseline' : 'inventory' }
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = 'http://127.0.0.1:' + server.address().port
  browser = await chromium.launch({
    headless: true, args: ['--no-sandbox'],
    ...(process.env.JBU_CHROMIUM_PATH ? { executablePath: process.env.JBU_CHROMIUM_PATH } : {}),
  })
})

after(async () => {
  await browser?.close()
  if (server) await new Promise(resolve => server.close(resolve))
  if (scratch) await rm(scratch, { recursive: true, force: true })
})

test('inventory grid navigation, grouping, column setup, saved views, batch confirmation, mobile and thumbnails', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 850 }, deviceScaleFactor: 2 })
  page.setDefaultTimeout(8000)
  try {
    await page.goto(origin + '/admin/artworks')
    await page.getByRole('link', { name: 'Artwork 750', exact: true }).waitFor()
    assert.equal(await page.getByRole('row').count(), 26)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    assert.equal(await page.getByRole('row').filter({ hasText: 'Artwork 749' }).getByRole('img', { name: 'No image' }).count(), 1)
    assert.match(await page.locator('td img').first().getAttribute('srcset'), /w=128/)
    await page.getByRole('button', { name: 'Next page', exact: true }).click()
    const secondPageTitle = page.getByRole('link', { name: 'Artwork 725', exact: true })
    await secondPageTitle.click()
    await page.getByRole('link', { name: 'Return to inventory' }).click()
    await secondPageTitle.waitFor()
    assert.equal(new URL(page.url()).searchParams.get('page'), '2')
    const search = page.getByRole('searchbox')
    await search.fill('INV-0003')
    const title = page.getByRole('link', { name: 'Artwork 3', exact: true })
    await title.waitFor()
    assert.equal(new URL(page.url()).searchParams.get('page'), '1')
    await title.click()
    await page.getByRole('link', { name: 'Return to inventory' }).click()
    await title.waitFor()
    assert.equal(await page.getByRole('searchbox').inputValue(), 'INV-0003')
    await search.fill('')
    await page.getByRole('link', { name: 'Artwork 750', exact: true }).waitFor()
    await page.getByLabel('Group by').selectOption('series')
    const group = page.getByRole('button', { name: 'Orbitals (13)', exact: true })
    await group.click()
    assert.equal(await group.getAttribute('aria-expanded'), 'false')
    assert.equal(await page.getByRole('link', { name: 'Artwork 750', exact: true }).count(), 0)
    await group.click()
    await page.getByLabel('Group by').selectOption('')
    await page.getByRole('button', { name: 'Columns', exact: true }).click()
    const columnDialog = page.getByRole('dialog')
    await columnDialog.getByRole('checkbox', { name: 'Owner', exact: true }).check()
    await columnDialog.getByRole('button', { name: 'Move up Owner' }).click()
    await columnDialog.getByRole('button', { name: 'Close' }).click()
    assert.deepEqual((await page.getByRole('columnheader').allTextContents()).slice(-3), ['Owner', 'Base price (MXN)', 'Actions'])
    await page.getByRole('button', { name: 'Filters', exact: true }).click()
    await page.getByRole('dialog').getByRole('checkbox', { name: 'Previous version' }).check()
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: 'Remove filter Version Previous version' }).waitFor()
    await page.getByRole('button', { name: 'Manage views' }).click()
    const viewDialog = page.getByRole('dialog')
    await viewDialog.getByRole('textbox', { name: 'View name' }).fill('Archive')
    await viewDialog.getByRole('button', { name: 'Save as new view' }).click()
    await viewDialog.getByRole('button', { name: 'Close' }).click()
    await page.reload()
    await page.getByRole('columnheader', { name: 'Owner' }).waitFor()
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fixture-account-metadata')).jbu_currency), 'USD')
    assert.equal(await page.getByLabel('View', { exact: true }).locator('option:checked').textContent(), 'Archive')
    await page.getByLabel('View', { exact: true }).selectOption('all')
    await page.getByRole('link', { name: 'Artwork 750', exact: true }).waitFor()
    await page.getByRole('checkbox', { name: 'Select rows on this page' }).check()
    await page.getByText('25 selected on this page').waitFor()
    await page.getByRole('button', { name: 'Change availability', exact: true }).click()
    const batch = page.getByRole('dialog')
    await batch.getByLabel('Target availability').selectOption('NOT_FOR_SALE')
    await batch.getByRole('button', { name: 'Validate selection' }).click()
    await batch.getByRole('button', { name: 'Confirm change' }).click()
    await page.getByRole('status').filter({ hasText: 'Updated 25' }).waitFor()
    assert.deepEqual(requests.filter(item => typeof item === 'object').map(item => item.apply), [false, true])
  } finally {
    await page.close()
  }
})

test('sampled browser requests, image transfer, DOM and heap across inventory interactions', async t => {
  for (const variant of baseline ? ['baseline', 'inventory'] : ['inventory']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    page.setDefaultTimeout(8000)
    const cdp = await page.context().newCDPSession(page)
    const observations = {}
    const start = origin + '/admin/artworks' + (variant === 'baseline' ? '?baseline=1' : '')
    try {
      async function measure() {
        await cdp.send('HeapProfiler.collectGarbage')
        const heap = await cdp.send('Runtime.getHeapUsage')
        const resources = await page.evaluate(() => {
          const all = performance.getEntriesByType('resource')
          const images = all.filter(entry => entry.initiatorType === 'img')
          const data = all.filter(entry => /\/api\/admin\/artworks\/inventory|\/legacy-data/.test(entry.name))
          return {
            requests: all.length, imageRequests: images.length,
            imageTransferBytes: images.reduce((sum, entry) => sum + entry.transferSize, 0),
            dataBodyBytes: data.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
            nodes: document.querySelectorAll('*').length,
            widths: [...new Set([...document.images].filter(image => image.complete && image.naturalWidth).map(image => image.naturalWidth))].sort((a, b) => a - b),
          }
        })
        return { ...resources, heapBytesAfterGC: heap.usedSize }
      }
      await page.goto(start, { waitUntil: 'networkidle' })
      await page.getByText('INV-0750', { exact: true }).waitFor()
      await page.waitForFunction(() => {
        const image = document.querySelector('tbody img')
        return image?.complete && image.naturalWidth > 0
      })
      await page.waitForLoadState('networkidle')
      observations.initial = await measure()
      for (let cycle = 0; cycle < 4; cycle++) {
        await page.getByRole('button', { name: 'Next page', exact: true }).click()
        await page.waitForLoadState('networkidle')
        await page.getByRole('button', { name: 'Previous page', exact: true }).click()
        await page.waitForLoadState('networkidle')
      }
      observations.afterPagination = await measure()
      if (variant === 'inventory') {
        const pagination = page.getByLabel('Records per page')
        await pagination.selectOption('100')
        await page.waitForLoadState('networkidle')
        await page.getByRole('searchbox').fill('Orbitals')
        await page.waitForResponse(response => response.url().includes('q=Orbitals'))
        await page.waitForLoadState('networkidle')
        observations.afterFilterAnd100Rows = await measure()
      }
      for (let cycle = 0; cycle < 3; cycle++) {
        await page.goto('about:blank')
        await page.goto(start, { waitUntil: 'networkidle' })
        await page.getByText('INV-0750', { exact: true }).waitFor()
      }
      observations.afterNavigation = await measure()
      t.diagnostic(variant + ' ' + JSON.stringify(observations))
    } finally {
      await page.close()
    }
  }
})
