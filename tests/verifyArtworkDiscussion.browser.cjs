/* eslint-disable @typescript-eslint/no-require-imports -- Optional standalone Playwright runner. */
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const site = process.env.JBU_TEST_SITE || 'http://127.0.0.1:3100'
const print = '/prints/SOLD-WITH-PRINTS'
const open = 'e7ea46f2-a585-497f-a529-e6d63c661ad1'
const limited = 'e7ea46f2-a585-497f-a529-e6d63c661ad2'

async function visit(page, path) {
  await page.goto(site + path, { waitUntil: 'load' })
  const consent = page.getByRole('button', { name: /necessary only|solo necesarias/i })
  await consent.waitFor({ timeout: 800 }).catch(() => {})
  if (await consent.isVisible()) await consent.click()
}

async function screenshot(page, filename) {
  if (!process.env.JBU_VISUAL_DIR) return
  await page.locator('dialog[open] img').evaluateAll(images => Promise.all(images.map(image => image.decode().catch(() => {}))))
  await page.screenshot({ path: process.env.JBU_VISUAL_DIR + '/' + filename + '.jpg', type: 'jpeg', quality: 85 })
}

async function source(dialog, expected) {
  const image = dialog.locator('img').first()
  await image.waitFor()
  assert.ok((await image.getAttribute('src')).includes(expected))
  assert.equal(await image.evaluate(node => getComputedStyle(node).objectFit), 'contain')
}

;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] })
  try {
    const desktop = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 940 } })
    const page = await desktop.newPage()
    page.setDefaultTimeout(12000)
    const reads = []
    page.on('request', request => {
      if (request.method() === 'GET' && request.url().includes('/api/artwork-comments?')) reads.push(new URL(request.url()))
    })
    await visit(page, '/artwork/EXAMPLE-01')
    const primary = page.getByRole('button', { name: 'Discuss this image', exact: true })
    await primary.scrollIntoViewIfNeeded()
    assert.equal(reads.length, 0)
    const before = await page.evaluate(() => window.scrollY)
    await primary.click()
    const dialog = page.getByRole('dialog', { name: 'Discussion on Example' })
    await dialog.getByText('Original photograph comment 1', { exact: true }).waitFor()
    assert.equal(reads.length, 1)
    await source(dialog, 'IMG_6137')
    const list = dialog.getByLabel('Comment list')
    assert.ok(await list.evaluate(node => node.scrollHeight > node.clientHeight))
    await screenshot(page, 'original-desktop-light')
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    assert.ok(await primary.evaluate(node => node === document.activeElement))
    assert.equal(await page.evaluate(() => window.scrollY), before)
    assert.equal(await page.evaluate(() => document.body.style.overflow), '')

    await page.getByRole('tab', { name: 'View image 2' }).click()
    await primary.click()
    await dialog.getByText('No comments on this image yet.').waitFor()
    await source(dialog, 'artwork-monumental-2')
    assert.match(reads.at(-1).searchParams.get('context'), /^gallery:/)
    await screenshot(page, 'empty-installation-photo')
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: 'Discuss the artwork' }).click()
    await dialog.getByText('Public fixture question').waitFor()
    assert.equal(reads.at(-1).searchParams.get('context'), 'artwork')
    await page.keyboard.press('Escape')

    await visit(page, print + '?country=MX')
    await page.getByRole('button', { name: 'View image 2' }).click()
    const printTrigger = page.getByRole('button', { name: 'Discuss this print photo' })
    await printTrigger.click()
    const printDialog = page.getByRole('dialog', { name: /Discussion on/ })
    await printDialog.getByText('Open print variant comment').waitFor()
    await source(printDialog, 'IMG_6137')
    assert.equal(reads.at(-1).searchParams.get('context'), 'print:' + open)
    await printDialog.getByRole('button', { name: 'View photo', exact: true }).click()
    const viewer = page.getByRole('dialog', { name: /Enlarged view/ })
    await viewer.getByText('2 / 2', { exact: true }).waitFor()
    assert.equal(await page.getByRole('dialog').count(), 1)
    await viewer.getByRole('button', { name: 'Discuss this image' }).click()
    await printDialog.getByText('Open print variant comment').waitFor()
    await page.keyboard.press('Escape')
    assert.ok(await printTrigger.evaluate(node => node === document.activeElement))

    await page.locator('#print-variant-select').selectOption(limited)
    await page.waitForURL('**variant=' + limited)
    await printTrigger.click()
    await printDialog.getByText('Limited print variant comment').waitFor()
    await source(printDialog, 'IMG_6203')
    assert.equal(await printDialog.getByText('Open print variant comment').count(), 0)
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('#print-variant-select').inputValue(), limited)

    await page.locator('#print-variant-select').selectOption(open)
    await page.getByRole('button', { name: 'View image 2' }).click()
    await printTrigger.click()
    const editor = printDialog.getByRole('textbox', { name: 'Share a question or comment' })
    await editor.fill('A draft about the second print photo')
    await page.keyboard.press('Escape')
    await printTrigger.click()
    assert.equal(await editor.inputValue(), 'A draft about the second print photo')
    await printDialog.getByRole('button', { name: 'Continue with Google' }).click()
    await page.waitForURL(url => url.pathname === print && url.searchParams.get('discussion') === 'print:' + open)
    await printDialog.getByRole('button', { name: 'Submit comment' }).waitFor()
    await source(printDialog, 'IMG_6137')
    assert.equal(await editor.inputValue(), 'A draft about the second print photo')
    let releaseSubmission
    let posts = 0
    const waitingForPost = new Promise(resolve => { releaseSubmission = resolve })
    await page.route('**/api/artwork-comments', route => {
      posts++
      releaseSubmission(route)
    })
    await printDialog.getByRole('button', { name: 'Submit comment' }).click()
    const pending = await waitingForPost
    await page.keyboard.press('Escape')
    await printTrigger.click()
    const submit = printDialog.getByRole('button', { name: 'Submit comment' })
    await submit.waitFor()
    assert.equal(await submit.isDisabled(), true)
    await pending.continue()
    await printDialog.getByText('Comment submitted for review').waitFor()
    assert.equal(posts, 1)
    assert.equal(await editor.inputValue(), '')

    await desktop.close()

    for (const dark of [false, true]) {
      const mobile = await browser.newContext({ locale: 'es-MX', isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } })
      await mobile.addCookies([{ name: 'jbu-theme', value: dark ? 'dark' : 'light', url: site }])
      const page = await mobile.newPage()
      await visit(page, print + '?country=MX')
      await page.getByRole('button', { name: 'Comentar esta foto del print' }).click()
      const dialog = page.getByRole('dialog', { name: /Comentarios sobre/ })
      await dialog.getByText('Open print variant comment').waitFor()
      assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth))
      await screenshot(page, 'print-mobile-' + (dark ? 'dark' : 'light'))
      const editor = dialog.getByRole('textbox')
      await editor.fill('Comentario desde el móvil')
      assert.ok(await editor.isVisible())
      await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
      await mobile.close()
    }

    const darkDesktop = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } })
    await darkDesktop.addCookies([{ name: 'jbu-theme', value: 'dark', url: site }])
    const errors = await darkDesktop.newPage()
    let attempts = 0
    await errors.route('**/api/artwork-comments?**', route => {
      attempts++
      if (attempts > 1) return route.continue()
    })
    await visit(errors, print + '?country=MX')
    await errors.getByRole('button', { name: 'Discuss this print photo' }).click()
    const darkDialog = errors.getByRole('dialog', { name: /Discussion on/ })
    await darkDialog.getByText('Loading comments…').waitFor()
    await source(darkDialog, 'IMG_6202')
    await screenshot(errors, 'loading-desktop-dark')
    await darkDialog.getByRole('button', { name: 'Retry' }).waitFor({ timeout: 12000 })
    await screenshot(errors, 'error-desktop-dark')
    await darkDialog.getByRole('button', { name: 'Retry' }).click()
    await darkDialog.getByText('Open print variant comment').waitFor()
    assert.equal(attempts, 2)
    await darkDesktop.close()
    console.log('Contextual photos, variant isolation, OAuth draft restoration, moderation, scroll/focus and timeout recovery passed')
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
