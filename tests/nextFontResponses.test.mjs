import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import responses from './nextFontResponses.cjs'

test('CI font responses contain real Carbon IBM Plex assets for every configured family and face', () => {
  for (const family of ['IBM Plex Sans', 'IBM Plex Serif', 'IBM Plex Mono']) {
    const css = responses['https://fonts.googleapis.com/css2?family=' + encodeURIComponent(family) + ':wght@300;400;500;600;700&display=swap']
    assert.ok(css.includes(`font-family: '${family}'`))
    assert.ok(css.includes('font-style: italic'))
    const files = [...css.matchAll(/src: url\(([^)]+)\)/g)].map(match => match[1])
    assert.equal(files.length, 10)
    for (const file of files) assert.equal(readFileSync(file).subarray(0, 4).toString(), 'wOF2')
  }
})
test('the font fixture rejects unknown providers and families instead of substituting a font', () => {
  assert.equal(responses['https://fonts.googleapis.com/css2?family=Unknown'], undefined)
  assert.equal(responses['https://example.test/font.css'], undefined)
  assert.equal(responses[Symbol.toStringTag], undefined)
})
