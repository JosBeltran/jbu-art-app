/* eslint-disable @typescript-eslint/no-require-imports -- Optional standalone browser runner. */
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const site = process.env.JBU_TEST_SITE || 'http://127.0.0.1:3100'

async function prepare(browser, options) {
  const context = await browser.newContext(options)
  const page = await context.newPage()
  await page.goto(site + '/prints/SOLD-WITH-PRINTS', { waitUntil: 'load' })
  const consent = page.getByRole('button', { name: /Necessary only/i })
  if (await consent.isVisible()) await consent.click()
  await page.getByRole('heading', { name: 'First Current' }).waitFor()
  return { context, page }
}

;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] })
  try {
    const desktop = await prepare(browser, { locale: 'en-US', viewport: { width: 1350, height: 900 } })
    const gallery = desktop.page.locator('#prints')
    const trigger = gallery.getByRole('button', { name: 'Enlarge print image' })
    await trigger.click()
    const dialog = desktop.page.getByRole('dialog', { name: /enlarged view of frame detail fixture/i })
    await dialog.waitFor()
    assert.equal(await dialog.getByRole('button', { name: 'Close' }).evaluate(element => element === document.activeElement), true)
    await desktop.page.keyboard.press('ArrowRight')
    await dialog.getByText('2 / 2', { exact: true }).waitFor()
    assert.ok(await dialog.getByRole('img', { name: 'Front view', exact: true }).isVisible())
    await desktop.page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await trigger.evaluate(element => element === document.activeElement), true)
    await gallery.locator('#print-variant-select').selectOption('e7ea46f2-a585-497f-a529-e6d63c661ad2')
    await gallery.getByText('Historical A1 fixture', { exact: true }).waitFor()
    assert.match(desktop.page.url(), /variant=e7ea46f2-a585-497f-a529-e6d63c661ad2/)
    assert.equal(await gallery.getByRole('button', { name: 'View image 1' }).count(), 0)
    await trigger.click()
    const limited = desktop.page.getByRole('dialog', { name: /enlarged view of historical a1 fixture/i })
    await limited.getByText('1 / 1', { exact: true }).waitFor()
    assert.equal(await limited.getByRole('img', { name: /front view|frame detail/i }).count(), 0)
    await desktop.context.close()

    const mobile = await prepare(browser, { locale: 'en-US', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    const mobileGallery = mobile.page.locator('#prints')
    const mobileTrigger = mobileGallery.getByRole('button', { name: 'Enlarge print image' })
    await mobileTrigger.scrollIntoViewIfNeeded()
    const box = await mobileTrigger.boundingBox()
    const touch = await mobile.context.newCDPSession(mobile.page)
    const point = { x: box.x + box.width * .8, y: box.y + box.height * .4 }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, x: point.x - 100 }] })
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await mobileGallery.getByText('2 / 2', { exact: true }).waitFor({ timeout: 5000 })
    assert.equal(await mobile.page.getByRole('dialog', { name: /enlarged view/i }).count(), 0)
    assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    await mobile.context.close()
    const stalled = await browser.newContext({ locale: 'en-US' })
    const page = await stalled.newPage()
    let requests = 0
    await page.route('**/api/shipping', route => {
      requests++
      if (requests > 1) return route.continue()
    })
    await page.goto(site + '/prints/SOLD-WITH-PRINTS?country=MX', { waitUntil: 'load' })
    const consent = page.getByRole('button', { name: /Necessary only/i })
    if (await consent.isVisible()) await consent.click()
    await page.getByText('View full specifications', { exact: true }).click()
    await page.getByText('Extended supplier specifications fixture.', { exact: true }).waitFor({ timeout: 3000 })
    await page.getByText('We could not check shipping. Please try again.', { exact: true }).waitFor({ timeout: 12000 })
    assert.equal(requests, 1)
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await page.getByText('Shipping included', { exact: true }).waitFor()
    assert.equal(requests, 2)
    await stalled.close()

    console.log('Desktop focus, keyboard and variant isolation plus mobile swipe, width and stalled shipping recovery verified')
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
