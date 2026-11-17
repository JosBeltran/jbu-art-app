import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scanner = fileURLToPath(new URL('../tools/design-system/static-audit.mjs', import.meta.url))

test('scanner inventories root entries, JS wrappers, providers and server JSX without treating APIs as UI', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'carbon-inventory-'))
  const put = async (name, content) => {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true })
    await writeFile(path.join(root, name), content)
  }
  const run = async () => {
    execFileSync(process.execPath, [scanner, '--output=' + path.join(root, 'report.json')], { cwd: root })
    return JSON.parse(await readFile(path.join(root, 'report.json'), 'utf8'))
  }
  try {
    await put('app/page.tsx', 'export default () => <main />')
    await put('app/layout.tsx', 'export default ({children}) => children')
    await put('app/catalog/page.js', 'export default () => <main />')
    await put('app/api/test/route.js', 'export const GET = () => new Response("ok")')
    await put('context/Example.jsx', 'export default () => <button>Go</button>')
    await put('lib/social/render.server.jsx', 'export const image = <div />')
    await put('components/theme.scss', '.x { color: #fff !important; }')
    await put('components/.hidden/Skip.jsx', '<input />')
    await put('components/node_modules/Skip.jsx', '<input />')
    const first = await run()
    assert.equal(first.schemaVersion, 2)
    assert.equal(first.totals.scannedUiFiles, 5)
    assert.equal(first.totals.discoveredRouteEntries, 3)
    assert.equal(first.totals.scannedStylesheetFiles, 1)
    assert.equal(first.totals.filesWithNativeControls, 1)
    assert.equal(first.totals.importantOccurrences, 1)
    assert.deepEqual(await run(), first, 'same source produces deterministic evidence')
    await put('context/Example.jsx', 'export default () => <button>Changed</button>')
    const changed = await run()
    assert.notEqual(first.ui.find(x => x.path === 'context/Example.jsx').sha256,
      changed.ui.find(x => x.path === 'context/Example.jsx').sha256)
    assert.equal(first.ui.find(x => x.path === 'app/page.tsx').sha256,
      changed.ui.find(x => x.path === 'app/page.tsx').sha256)
    assert.match(first.method, /not WCAG or Carbon compliance/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
