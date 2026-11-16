/* eslint-disable @typescript-eslint/no-require-imports -- Optional standalone browser runner; no production dependency. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs/promises')
const site = process.env.JBU_TEST_SITE || 'http://localhost:3200'
const out = path.resolve(
  process.env.JBU_SCREENSHOTS || 'docs/phase2-screenshots'
)
const results = []
const t = {
  es: {
    included: 'Envío incluido',
    local: '¿Estás en Monterrey?',
    market: /País de compra/,
    heading: 'Tu país de compra',
    country: 'País de entrega',
    save: 'Guardar destino',
    sweden: 'Suecia (SE)',
    mx: 'México (MX)',
  },
  en: {
    included: 'Shipping included',
    local: 'Are you in Monterrey?',
    market: /Shopping country/,
    heading: 'Your shopping country',
    country: 'Delivery country',
    save: 'Save destination',
    sweden: 'Sweden (SE)',
    mx: 'Mexico (MX)',
  },
}
let browser
async function context({
  width = 1440,
  dark = false,
  lang = 'es',
  market = 'MX',
  authenticated = false,
} = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height: 1000 },
    locale: lang === 'es' ? 'es-MX' : 'en-US',
  })
  await ctx.addCookies([
    { name: 'jbu-market', value: market, url: site },
    { name: 'jbu-theme', value: dark ? 'dark' : 'light', url: site },
  ])
  if (authenticated) {
    const response = await fetch(
      (process.env.JBU_TEST_SUPABASE || 'http://127.0.0.1:3998') +
        '/auth/v1/token?grant_type=pkce',
      { method: 'POST' }
    )
    const session = await response.json()
    session.expires_at = Math.floor(Date.now() / 1000) + 3600
    await ctx.addCookies([
      {
        name: 'sb-127-auth-token',
        value:
          'base64-' +
          Buffer.from(JSON.stringify(session)).toString('base64url'),
        url: site,
      },
    ])
  }
  const page = await ctx.newPage(),
    errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/exchange-rate', (route) =>
    route.fulfill({ json: { usdPerMxn: 0.05, source: 'test' } })
  )
  await page.goto(site + '/artwork/EXAMPLE-01', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  })
  await page
    .getByText(t[lang].included, { exact: true })
    .waitFor({ timeout: 120000 })
  const consent = page.getByRole('button', {
    name: /^(SOLO NECESARIAS|NECESSARY ONLY)$/,
    exact: true,
  })
  await consent.waitFor({state:'visible',timeout:15000})
  await consent.click()
  const purchase = page
    .locator(
      'ul[aria-label="' +
        (lang === 'es' ? 'Beneficios de compra' : 'Purchase benefits') +
        '"]'
    )
    .first()
    .locator('xpath=ancestor::section[1]')
  return { ctx, page, purchase, errors }
}
async function choose(page, label, country) {
  await page.getByRole('button', { name: label.market }).click()
  await page.getByRole('dialog',{name:label.heading})
    .getByRole('combobox', { name: label.country })
    .fill(country.slice(0, 3))
  await page.getByRole('option', { name: country, exact: true }).click()
  await page.getByRole('button', { name: label.save, exact: true }).click()
}
;(async () => {
  await fs.mkdir(out, { recursive: true })
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  })
  for (const width of [320, 390, 768, 1440])
    for (const dark of [false, true]) {
      const lang = dark ? 'en' : 'es',
        label = t[lang],
        { ctx, page, purchase, errors } = await context({ width, dark, lang })
      await page
        .getByRole('button', { name: label.local, exact: true })
        .waitFor()
      const add = purchase.getByRole('button', {
          name: lang === 'es' ? 'Agregar al carrito' : 'Add to cart',
          exact: true,
        }),
        buy = purchase.getByRole('button', {
          name: lang === 'es' ? 'Comprar ahora' : 'Buy now',
          exact: true,
        })
      const a = await add.boundingBox(),
        b = await buy.boundingBox()
      assert.ok(
        Math.abs(a.height - b.height) < 1,
        'equal primary button heights'
      )
      if (width < 600) assert.ok(b.y > a.y, 'narrow purchase actions stack')
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      )
      assert.equal(overflow, false, `no horizontal overflow at ${width}`)
      assert.equal(
        await purchase.getByText(/incluido.*\$0|included.*\$0/).count(),
        0
      )
      assert.equal(errors.length, 0, errors.join('\n'))
      await page.getByRole('button', { name: label.local, exact: true }).focus()
      await page.keyboard.press('Enter')
      assert.equal(
        await page
          .getByRole('button', { name: label.local, exact: true })
          .getAttribute('aria-expanded'),
        'true'
      )
      await page.getByRole('button', { name: label.local, exact: true }).click()
      await purchase.locator('ul').first().click()
      if ([390, 1440].includes(width))
        await purchase.screenshot({
          path: path.join(
            out,
            `${width === 1440 ? 'desktop' : 'mobile'}-${dark ? 'dark' : 'light'}.png`
          ),
        })
      results.push({
        test: 'layout/keyboard',
        width,
        theme: dark ? 'dark' : 'light',
        language: lang,
        buttonHeight: a.height,
        pass: true,
      })
      console.log(`PASS layout ${width}px ${dark?'dark':'light'} ${lang}`)
      await ctx.close()
    }
  const { ctx, page, purchase } = await context()
  await choose(page, t.es, t.es.sweden)
  await page.waitForFunction(() => document.cookie.includes('jbu-market=SE'))
  await page.waitForFunction(
    () => !document.body.innerText.includes('¿Estás en Monterrey?')
  )
  await page.waitForFunction(() => document.body.innerText.includes('$6,250'))
  assert.equal(
    await page.getByRole('button', { name: t.es.local, exact: true }).count(),
    0
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText(t.es.included, { exact: true }).waitFor()
  assert.ok(
    (await ctx.cookies()).some(
      (cookie) => cookie.name === 'jbu-market' && cookie.value === 'SE'
    )
  )
  await page.getByRole('button', { name: t.es.market }).click()
  await page
    .getByRole('dialog', { name: t.es.heading })
    .waitFor({ state: 'visible' })
  await page.keyboard.press('Escape')
  await page
    .getByRole('dialog', { name: t.es.heading })
    .waitFor({ state: 'hidden', timeout: 5000 })
  await purchase.screenshot({ path: path.join(out, 'sweden-shipping.png') })
  await page.goto(site + '/catalog', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: t.es.market }).waitFor()
  await choose(page, t.es, t.es.mx)
  await page.goto(site + '/artwork/EXAMPLE-01', {
    waitUntil: 'domcontentloaded',
  })
  await page.getByRole('button', { name: t.es.local, exact: true }).waitFor()
  results.push({
    test: 'MX → SE → refresh → catalog → MX; currency/local eligibility/persistence',
    pass: true,
  })
  await ctx.close()
  const signed = await context({ authenticated: true, market: 'SE' })
  let posted
  await signed.page.route('**/api/checkout', async (route) => {
    posted = route.request().postDataJSON()
    await route.fulfill({
      status: 400,
      json: { error: 'fixture_checkout_stopped' },
    })
  })
  await signed.purchase
    .getByRole('button', { name: 'Comprar ahora', exact: true })
    .click()
  await signed.page.waitForFunction(() =>
    document.body.innerText.includes('fixture_checkout_stopped')
  )
  assert.equal(posted.destination, 'SE')
  assert.equal(posted.currency, 'USD')
  await choose(signed.page, t.es, t.es.mx)
  await signed.page
    .getByRole('button', { name: t.es.local, exact: true })
    .click()
  assert.equal(
    await signed.page
      .getByRole('link', { name: 'Registrarme gratis', exact: true })
      .count(),
    0,
    'authenticated users are not asked to register'
  )
  results.push({
    test: 'authenticated checkout sends selected market/currency; registration hidden',
    pass: true,
  })
  await signed.ctx.close()
  await fs.writeFile(
    path.join(out, 'results.json'),
    JSON.stringify(results, null, 2)
  )
  console.log(JSON.stringify(results, null, 2))
  await browser.close()
})().catch(async (error) => {
  console.error(error)
  if (browser) await browser.close()
  process.exitCode = 1
})
