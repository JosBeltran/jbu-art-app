import assert from 'node:assert/strict'

const pages = [
  ['/prints', 'Preview-only Test Prints'],
  ['/series/epoxi', 'Preview-only Test Epoxy'],
  ['/catalog?prints=true', 'Preview-only Test Prints'],
]
for (const [path, title] of pages) {
  const response = await fetch('http://127.0.0.1:3100' + path, {
    headers: { 'User-Agent': 'facebookexternalhit/1.1' },
    signal: AbortSignal.timeout(25000),
  })
  assert.equal(response.status, 200, path + ' returned ' + response.status)
  const html = await response.text()
  const head = html.split('</head>')[0]
  assert.ok(head.includes('og:title'), path + ' missing og:title in head')
  assert.ok(head.includes('og:description'), path + ' missing og:description in head')
  assert.ok(head.includes('og:image'), path + ' missing og:image in head')
  assert.ok(head.includes('og:url'), path + ' missing og:url in head')
  assert.ok(head.includes('twitter:card'), path + ' missing twitter:card in head')
  assert.ok(head.includes('rel="canonical"'), path + ' missing canonical in head')
  assert.ok(head.includes(title), path + ' missing configured title in server HTML')
  console.log('Facebook crawler head metadata verified:', path)
}
