/* eslint-disable @typescript-eslint/no-require-imports -- Optional standalone browser runner. */
// Run with PLAYWRIGHT_MODULE=/path/to/playwright MARKET_BASE_URL=http://localhost:3203 node tests/marketSelector.browser.cjs
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.MARKET_BASE_URL || 'http://localhost:3203'
;(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  })
  try {
    for (const width of [1440, 390])
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({
          locale: 'es-MX',
          viewport: { width, height: 1000 },
        })
        await context.addCookies([
          { name: 'jbu-market', value: 'MX', url: base },
          { name: 'jbu-theme', value: theme, url: base },
        ])
        const page = await context.newPage()
        await page.goto(base, {
          waitUntil: 'domcontentloaded',
          timeout: 120000,
        })
        const consent = page.getByRole('button', {
          name: /^(SOLO NECESARIAS|NECESSARY ONLY)$/i,
        })
        await consent.waitFor({ state: 'visible' })
        await consent.click()
        await page.waitForFunction(() =>
          [
            ...document.querySelectorAll(
              'button[aria-label^="País de compra"]'
            ),
          ].some((button) => !button.disabled)
        )
        if (width < 600)
          await page.getByRole('button', { name: 'Abrir menú' }).click()
        const trigger = page
          .getByRole('button', { name: /País de compra/ })
          .first()
        await trigger.click({ timeout: 120000 })
        const dialog = page.getByRole('dialog', { name: 'Tu país de compra' })
        await dialog.waitFor()
        const styles = await dialog.evaluate((el) => {
          const blends = []
          for (let p = el; p; p = p.parentElement)
            if (getComputedStyle(p).mixBlendMode !== 'normal')
              blends.push(getComputedStyle(p).mixBlendMode)
          const box = el.getBoundingClientRect()
          return {
            blends,
            transform: getComputedStyle(el).textTransform,
            font: getComputedStyle(el).fontFamily,
            theme: el
              .closest('.cds--g10, .cds--g100')
              ?.className.match(/cds--(g100|g10)\b/)?.[1],
            insideHost: !!el.closest('#jbu-overlay-root'),
            left: box.left,
            right: box.right,
          }
        })
        assert.deepEqual(styles.blends, [])
        assert.equal(styles.transform, 'none')
        assert.doesNotMatch(styles.font, /Mono/)
        assert.equal(styles.theme, theme === 'dark' ? 'g100' : 'g10')
        assert.equal(styles.insideHost, true)
        assert.ok(styles.left >= 0 && styles.right <= width)
        if (process.env.SCREENSHOT_DIR)
          await page.screenshot({
            path: `${process.env.SCREENSHOT_DIR}/market-dialog-${width}-${theme}.png`,
          })
        await page.keyboard.press('Escape')
        await dialog.waitFor({ state: 'hidden' })
        await page.waitForFunction(() =>
          document.activeElement
            ?.getAttribute('aria-label')
            ?.startsWith('País de compra')
        )
        await trigger.click()
        await dialog.getByRole('combobox').fill('SE')
        await dialog.getByRole('option', { name: /\(SE\)/ }).click()
        await dialog.getByRole('button', { name: 'Guardar destino' }).click()
        await dialog.waitFor({ state: 'hidden' })
        assert.equal(
          (await context.cookies()).find((c) => c.name === 'jbu-market')?.value,
          'SE'
        )
        console.log(
          `PASS homepage ${width}px ${theme}: theme, typography, layering, focus, destination`
        )
        await context.close()
      }
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
