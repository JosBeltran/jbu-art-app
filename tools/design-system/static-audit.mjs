/**
 * Full source inventory and risk flags, NOT an automated Carbon conformance verdict.
 * Run: node tools/design-system/static-audit.mjs
 * Outputs JSON evidence for all UI files/stylesheets to /tmp or explicit --output.
 */
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const sourceRoots = ['app', 'components']
async function traverse(dir) {
  try {
    const entries = await readdir(path.join(ROOT, dir), { withFileTypes: true })
    const files = []
    for (const entry of entries) {
      const child = path.posix.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !['node_modules', '.next'].includes(entry.name)) files.push(...await traverse(child))
      } else if (entry.isFile()) files.push(child)
    }
    return files
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}
const files = (await Promise.all(sourceRoots.map(traverse))).flat().sort()
const read = name => readFile(path.join(ROOT, name), 'utf8')
const counts = (text, regex) => [...text.matchAll(regex)].length
const ui = []
const styles = []
for (const file of files) {
  if (/\.(jsx|tsx)$/.test(file)) {
    const content = await read(file)
    ui.push({
      path: file,
      lines: content.split('\n').length,
      importsCarbonReact: /from ['"]@carbon\/react['"]/.test(content),
      importsCarbonIcons: /from ['"]@carbon\/icons-react['"]/.test(content),
      nativeControlOccurrences: counts(content, /<(?:button|input|select|textarea|dialog)(?=[\s>])/g),
      inlineStyleOccurrences: counts(content, /style=\{/g),
      hasCssModule: /\.module\.(?:css|scss)/.test(content),
    })
  } else if (/\.(css|scss|sass)$/.test(file)) {
    const content = await read(file)
    // This is a noisy risk detector: literals in artwork/backdrops may be justified.
    styles.push({
      path: file,
      lines: content.split('\n').length,
      hexColorOccurrences: counts(content, /#[0-9a-fA-F]{3,8}\b/g),
      importantOccurrences: counts(content, /!important\b/g),
      legacyBxSelectors: counts(content, /\.bx--[\w-]+/g),
      carbonInternalSelectors: counts(content, /\.cds--[\w-]+/g),
      jbuTokens: counts(content, /--jbu-[\w-]+/g),
      cdsTokens: counts(content, /--cds-[\w-]+/g),
    })
  }
}
const routes = files.filter(file => /^app\/.*\/(?:page|layout|loading|error|not-found)\.(jsx?|tsx?)$/.test(file))
const totals = {
  scannedUiFiles: ui.length,
  scannedStylesheetFiles: styles.length,
  discoveredRouteEntries: routes.length,
  filesWithNativeControls: ui.filter(x => x.nativeControlOccurrences > 0).length,
  filesImportingCarbonReact: ui.filter(x => x.importsCarbonReact).length,
  totalInlineStyles: ui.reduce((sum, x) => sum + x.inlineStyleOccurrences, 0),
  hexColorOccurrences: styles.reduce((sum, x) => sum + x.hexColorOccurrences, 0),
  importantOccurrences: styles.reduce((sum, x) => sum + x.importantOccurrences, 0),
  legacyBxSelectorOccurrences: styles.reduce((sum, x) => sum + x.legacyBxSelectors, 0),
}
const report = { method: 'source risk inventory only; not WCAG or Carbon compliance', totals, routes, ui, styles }
const arg = process.argv.find(x => x.startsWith('--output='))
const output = arg?.slice('--output='.length) || '/tmp/jbu-carbon-source-audit.json'
await mkdir(path.dirname(output), { recursive: true })
await writeFile(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ output, ...totals }, null, 2))
