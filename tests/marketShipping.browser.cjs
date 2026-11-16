/* eslint-disable @typescript-eslint/no-require-imports -- Optional standalone browser runner. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const site = process.env.JBU_TEST_SITE || 'http://localhost:3200'
;(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  })
  const results = []
  try {
    for (const scenario of [
      {
        name: 'fixed',
        policy: {
          method: 'FIXED_RATE',
          amount_minor: 35000,
          minimum_days: 3,
          maximum_days: 7,
        },
        expected: 'Envío: $350 MXN',
      },
      {
        name: 'quote',
        policy: { method: 'QUOTE_REQUIRED' },
        expected: 'Envío por cotizar',
        blocked: true,
      },
      {
        name: 'buyer',
        policy: { method: 'BUYER_ARRANGED' },
        expected: 'Organiza tu propio envío',
      },
      {
        name: 'prodigi',
        policy: { fulfillment_provider: 'PRODIGI' },
        expected: 'Envío incluido',
        noLocal: true,
      },
      {
        name: 'prepaid-local',
        config: { paymentOnDeliveryEnabled: false },
        expected: 'Envío incluido',
        prepaid: true,
      },
      {
        name: 'missing-policy',
        missing: true,
        expected: 'No hay un servicio de envío configurado',
        blocked: true,
      },
      {
        name: 'no-fx',
        market: 'SE',
        noFx: true,
        expected: 'Envío incluido',
        noLocal: true,
      },
    ]) {
      const context = await browser.newContext({
        locale: 'es-MX',
        viewport: { width: 1280, height: 1000 },
      })
      await context.addCookies([
        { name: 'jbu-market', value: scenario.market || 'MX', url: site },
      ])
      const page = await context.newPage()
      await page.route('**/api/exchange-rate', (route) =>
        route.fulfill({
          json: { usdPerMxn: scenario.noFx ? null : 0.05, source: 'fixture' },
        })
      )
      await page.route('**/api/shipping', async (route) => {
        const response = await route.fetch()
        const data = await response.json()
        data.policies = data.policies.map((policy) => ({
          ...policy,
          ...scenario.policy,
        }))
        if (scenario.missing) data.defaults = {}
        await route.fulfill({ json: data })
      })
      if (scenario.config)
        await page.route('**/api/local-delivery**', async (route) => {
          const response = await route.fetch()
          const data = await response.json()
          data.config = { ...data.config, ...scenario.config }
          await route.fulfill({ json: data })
        })
      await page.goto(site + '/artwork/EXAMPLE-01', {
        waitUntil: 'domcontentloaded',
        timeout: 120000,
      })
      const consent=page.getByRole('button',{name:/^(SOLO NECESARIAS|NECESSARY ONLY)$/})
      await consent.waitFor({state:'visible',timeout:15000});await consent.click()
      const purchase = page
        .locator('ul[aria-label="Beneficios de compra"]')
        .first()
        .locator('xpath=ancestor::section[1]')
      await purchase
        .getByText(scenario.expected, { exact: !scenario.missing })
        .waitFor({ timeout: 120000 })
      if (scenario.blocked)
        assert.equal(
          await purchase
            .getByRole('button', { name: 'Comprar ahora', exact: true })
            .count(),
          0
        )
      if (scenario.noLocal)
        assert.equal(
          await purchase
            .getByRole('button', { name: '¿Estás en Monterrey?', exact: true })
            .count(),
          0
        )
      if (scenario.name === 'fixed')
        await purchase
          .getByText('Entrega estimada: 3–7 días hábiles', { exact: true })
          .waitFor()
      if (scenario.prepaid) {
        await purchase
          .getByRole('button', { name: '¿Estás en Monterrey?', exact: true })
          .click()
        await purchase
          .getByText('Esta opción requiere pago anticipado.', { exact: false })
          .waitFor()
        assert.equal(
          await purchase
            .getByRole('link', { name: 'Registrarme gratis', exact: true })
            .count(),
          0
        )
      }
      if (scenario.noFx)
        assert.ok(
          (await purchase.innerText()).includes('MXN'),
          'without authoritative FX the price stays MXN'
        )
      results.push({ scenario: scenario.name, pass: true })
      console.log(`PASS shipping ${scenario.name}`)
      await context.close()
    }
    console.log(JSON.stringify(results, null, 2))
    await fs.writeFile(
      'docs/phase2-screenshots/shipping-results.json',
      JSON.stringify(results, null, 2)
    )
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
