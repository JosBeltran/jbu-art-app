/** Actual components/CSS with isolated data/router boundaries. See PHASE2.md. */
import { before, after, test as nodeTest } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import http from 'node:http'
const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(process.env.JBU_BROWSER_TOOLS ? path.join(process.env.JBU_BROWSER_TOOLS, 'package.json') : import.meta.url)
const { build } = require('esbuild')
const { chromium } = require('playwright')
const ref = process.env.JBU_OVERLAY_SOURCE_REF
const report = { source: ref ? execFileSync('git',['rev-parse',ref],{cwd:root,encoding:'utf8'}).trim() : 'working tree', results: [], method: 'Real components and Carbon CSS; isolated data/router/media. Chromium desktop emulation; not live commerce or screen-reader acceptance.', matrix: [] }
const evidence = process.env.JBU_OVERLAY_EVIDENCE
function test(name, run) {
  return nodeTest(name, async () => {
    const row = { case: name }
    try { await run(); row.result = 'pass' }
    catch (error) { row.result = 'fail'; row.error = error.message; throw error }
    finally { report.results.push(row) }
  })
}
let scratch, server, browser, origin
before(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), 'jbu-overlays-'))
  const mocks = {
    'next/navigation': `export function useRouter(){return {push(){},refresh(){},replace(){}}} export const usePathname=()=>'/catalog'; export const useSearchParams=()=>new URLSearchParams();`,
    'next/link': `export default function Link(props){return <a {...props}/>}`,
    '@/components/I18nProvider': `export const useI18n=()=>({t:(es,en)=>window.fixtureLang==='es'?es:en,lang:window.fixtureLang||'en',locale:window.fixtureLang==='es'?'es-MX':'en-US'}); export const useLocalized=()=>((row,key)=>row?.[key+'_en']||row?.[key]);`,
    '@/lib/supabaseClient': `export const supabase={auth:{getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),updateUser:async()=>({})},from:()=>({insert(rows){window.overlayFixture.insertCount=(window.overlayFixture.insertCount||0)+1;window.overlayFixture.inserted=rows;return this},select(){return this},async single(){if(window.fixtureDelayInsert)await new Promise(resolve=>window.overlayFixture.finishInsert=resolve);return {data:{id:'series',...window.overlayFixture.inserted[0]}}}})};`,
    '@/context/CartContext': `export const useCart=()=>({cart:[{id:'art',type:window.fixtureOriginal?'ORIGINAL':'PRINT',variantId:window.fixtureOriginal?null:'variant',edition_type:'OPEN',quantity:1,price:100,title:'Fixture artwork',sku:'FIXTURE',image:'/art.svg'}],user:null,removeFromCart(){},clearCart(){}});`,
    '@/components/CurrencyProvider': `export const useCurrency=()=>({price:n=>({text:'$'+n}),total:()=>({text:'$100'}),chargeCurrency:'MXN'}); export const ExchangeNote=()=>null;`,
    '@/components/ArtworkImage': `export default function Image(props){return <img alt={props.title} src='/art.svg' className={props.className}/>}`,
    '@/components/media/OptimizedImg': `export default function Image(props){return <img {...props} />}`,
    '@/components/media/MediaGallery': `export const VideoSlide=()=>null;`,
    '@/components/AskForPriceButton': `export default function Button(){return null}`,
    '@/components/CartShippingNotice': `export default function Notice(){return null}`,
    '@/components/promo/WelcomePromoBadge': `export default function Badge(){return null}`,

  }
  await build({ entryPoints: [path.join(root, 'tests/fixtures/carbonOverlays.jsx')], bundle: true,
    outfile: path.join(scratch, 'bundle.js'), jsx: 'automatic', alias: { '@': root }, nodePaths: [path.join(root, 'node_modules')],
    plugins: [{ name: 'overlay-test-boundaries', setup(builder) {
      builder.onResolve({ filter: /^(next\/|@\/)/ }, args => mocks[args.path] ? { path: args.path, namespace: 'fixture' } : undefined)
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'jsx', resolveDir: root }))
      if (ref) builder.onLoad({ filter: /\.(jsx|tsx|css)$/ }, async args => {
        const relative = path.relative(root, args.path)
        if (!/^(components\/|app\/catalog\/)/.test(relative)) return
        try { return { contents: execFileSync('git', ['show', ref + ':' + relative], { cwd: root, encoding: 'utf8' }), loader: relative.endsWith('.css') ? 'local-css' : relative.endsWith('.tsx') ? 'tsx' : 'jsx', resolveDir: path.dirname(args.path) } } catch { return }
      })
    } }],
  })
  const appRequire = createRequire(path.join(root, 'package.json'))
  const rawGlobals = await readFile(path.join(root, 'app/globals.css'), 'utf8')
  let cssBase = root
  if(ref) {
    cssBase=path.join(scratch,'baseline-source');await mkdir(cssBase)
    execFileSync('tar',['-x','-C',cssBase],{input:execFileSync('git',['archive',ref,'app','components'],{cwd:root,maxBuffer:32*1024*1024})})
  }
  const globals = (await appRequire('postcss')([appRequire('@tailwindcss/postcss')({ base: cssBase })]).process(rawGlobals, { from: path.join(root, 'app/globals.css') })).css
  const carbon = await readFile(path.join(root, 'node_modules/@carbon/styles/css/styles.css'), 'utf8')
  await writeFile(path.join(scratch, 'index.html'), `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:"IBM Plex Sans";src:url(/font.woff)}:root{--font-plex-sans:"IBM Plex Sans";--font-plex-mono:monospace;--font-plex-serif:serif}${carbon}\n${globals}</style><link rel="stylesheet" href="/bundle.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`)
  server = http.createServer(async (request, response) => {
    if (request.url === '/font.woff') { response.setHeader('Content-Type','font/woff');response.end(await readFile(path.join(root,'public/social/IBMPlexSans-Regular.woff')));return }
    if (request.url.startsWith('/art')) {response.setHeader('Content-Type','image/svg+xml');response.end('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#8a3ffc"/><circle cx="300" cy="400" r="180" fill="#f1c21b"/></svg>');return}
    const file = { '/': 'index.html', '/bundle.js': 'bundle.js', '/bundle.css': 'bundle.css' }[request.url]
    if (!file) { response.writeHead(404).end(); return }
    response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html')
    response.end(await readFile(path.join(scratch, file)))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = 'http://127.0.0.1:' + server.address().port
  browser = await chromium.launch({ headless: true, ...(process.env.JBU_CHROMIUM_PATH ? { executablePath: process.env.JBU_CHROMIUM_PATH } : {}), args: ['--no-sandbox'] })
})
after(async () => {
  if (evidence) { await mkdir(path.dirname(evidence), { recursive: true }); await writeFile(evidence, JSON.stringify(report, null, 2)+'\n') }
  await browser?.close()
  if (server) await new Promise(resolve => server.close(resolve))
  if (scratch) await rm(scratch, {recursive:true,force:true})
})
async function start(width, dark, deviceScaleFactor=1, lang='en') {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor })
  page.setDefaultTimeout(8000)
  await page.addInitScript(({dark,lang}) => { window.fixtureDark=dark;window.fixtureLang=lang;localStorage.setItem('jbu-theme',dark?'dark':'light') },{dark,lang})
  if (process.env.JBU_OVERLAY_DEBUG) page.on('console',message=>console.log(message.text()))
  await page.goto(origin)
  await page.waitForFunction(() => window.overlayFixture?.ready)
  await page.waitForTimeout(150)
  await page.evaluate(() => {document.body.style.overflow='auto'})
  return page
}
for (const width of [375,672,768,1056,1440]) for (const dark of [false,true]) {
  test(`country surface ${width} ${dark?'dark':'light'}`,async()=>{
    const page=await start(width,dark)
    try {
      await page.getByRole('button',{name:'Shopping country',exact:true}).click()
      const dialog=page.getByRole('dialog')
      await dialog.waitFor()
      await page.waitForTimeout(350)
      const measurement=await dialog.evaluate(el=>{const s=getComputedStyle(el);const r=el.getBoundingClientRect();return {background:s.backgroundColor,layer:s.getPropertyValue('--cds-layer'),text:s.color,opacity:s.opacity,dialogWidth:r.width,x:r.x,bottom:r.bottom,viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,focus:el.contains(document.activeElement),headerAncestor:!!el.closest('header'),aboveArtwork:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})
      report.matrix.push({kind:'country',width,dark,...measurement})
      if(evidence&&[375,1440].includes(width)){await page.screenshot({path:path.join(path.dirname(evidence),`country-${ref?'before':'after'}-${width}-${dark?'dark':'light'}.png`)})}
      assert.notEqual(measurement.background,'rgba(0, 0, 0, 0)')
      assert.equal(measurement.opacity,'1')
      assert.equal(measurement.overflow,false)
      assert.equal(measurement.focus,true)
      assert.equal(measurement.aboveArtwork,true)
      assert.equal(measurement.headerAncestor,false)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(80)
      assert.equal(await page.getByRole('dialog').count(),0)
      assert.equal(await page.getByRole('button',{name:'Shopping country',exact:true}).evaluate(el=>el===document.activeElement),true)
      assert.equal(await page.evaluate(()=>document.body.style.overflow),'auto')
    } finally {await page.close()}
  })
}


async function contained(page, dialog) {
  assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true,'initial focus inside dialog')
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden','scroll locked')
  assert.equal(await page.locator('#root').evaluate(el=>el.inert),true,'background is inert')
  for (const key of ['Shift+Tab','Tab','Tab','Tab','Tab','Tab','Shift+Tab']) {
    await page.keyboard.press(key)
    await page.waitForTimeout(30)
    assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true,'focus contained after '+key)
  }
  await page.locator('#background').evaluate(el=>el.focus())
  assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true,'background cannot steal focus')
}
async function closed(page, trigger) {
  await page.getByRole('dialog').waitFor({state:'hidden',timeout:2500})
  await page.waitForTimeout(50)
  assert.equal(await page.locator(trigger).evaluate(el=>el===document.activeElement),true,'return focus')
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'auto')
  assert.equal(await page.locator('#root').evaluate(el=>el.inert),false)
}
for (const width of [375,672,768,1056,1440]) for (const dark of [false,true]) {
  for (const kind of ['shipping','cart','series','lightbox','reveal','catalog']) {
    test(`${kind} lifecycle ${width} ${dark?'dark':'light'}`,async()=>{
      const page=await start(width,dark)
      try {
        await page.locator('#'+kind+'-trigger').click()
        let trigger='#'+kind+'-trigger'
        if(kind==='catalog') {
          const launcher=page.getByRole('button',{name:/^Filters/,includeHidden:true})
          await launcher.evaluate(el=>el.id='catalog-filter-trigger')
          if(width<768) { await launcher.click(); trigger='#catalog-filter-trigger' }
          else await launcher.evaluate(el=>el.click()) // test modal at desktop widths without revealing a mobile-only launcher
        }
        if(evidence&&ref&&width===375) await page.screenshot({path:path.join(path.dirname(evidence),`${kind}-before-${width}-${dark?'dark':'light'}.png`)})
        const dialog=page.getByRole('dialog')
        await dialog.waitFor({timeout:2500})
        await page.waitForTimeout(80)
        await contained(page,dialog)
        const data=await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return {background:getComputedStyle(el).backgroundColor,dialogWidth:r.width,bottom:r.bottom,viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth}})
        report.matrix.push({kind,width,dark,...data})
        assert.equal(data.overflow,false)
        assert.ok(data.dialogWidth<=width+1)
        if(evidence&&width===375) await page.screenshot({path:path.join(path.dirname(evidence),`${kind}-${ref?'before':'after'}-${width}-${dark?'dark':'light'}.png`)})
        await page.keyboard.press('Escape')
        await closed(page,trigger)
      } finally {await page.close()}
    })
  }
}

test('country choice persists destination/currency and restores its launcher',async()=>{
  const page=await start(375,true)
  try {
    await page.getByRole('button',{name:'Shopping country',exact:true}).click()
    const input=page.getByRole('combobox')
    await input.fill('Canada')
    await page.getByRole('option',{name:/Canada/}).click()
    await page.getByRole('button',{name:'Save destination',exact:true}).click()
    await page.waitForTimeout(80)
    const cookie=await page.evaluate(()=>document.cookie)
    assert.match(cookie,/jbu-market=CA/)
    assert.match(cookie,/jbu-currency=USD/)
    assert.equal(await page.getByRole('button',{name:/Shopping country: Canada/}).evaluate(el=>el===document.activeElement),true)
  }finally{await page.close()}
})
test('shipping prompt preserves original request and applies the selected destination',async()=>{
  const page=await start(375,true)
  try{
    await page.locator('#shipping-trigger').click()
    await page.getByLabel('Country',{exact:true}).selectOption('CA')
    await page.getByRole('button',{name:'Continue to checkout',exact:true}).click()
    await page.waitForFunction(()=>window.overlayFixture.requests.length===2)
    assert.deepEqual(await page.evaluate(()=>window.overlayFixture.requests),[
      {requestKey:'unchanged',currency:'MXN'}, {requestKey:'unchanged',currency:'USD',destination:'CA'},
    ])
    await closed(page,'#shipping-trigger')
  }finally{await page.close()}
})
test('series Carbon form preserves the insertion payload and associated labels',async()=>{
  const page=await start(768,true)
  try{
    await page.locator('#series-trigger').click()
    await page.getByLabel('Series title',{exact:true}).fill('  New collection  ')
    await page.getByLabel('Cover image URL (optional)',{exact:true}).fill(' /cover.jpg ')
    await page.getByLabel('Description (optional)',{exact:true}).fill(' Details ')
    await page.getByRole('button',{name:'Create Series',exact:true}).click()
    await closed(page,'#series-trigger')
    const rows=await page.evaluate(()=>window.overlayFixture.inserted)
    assert.deepEqual({...rows[0],slug:undefined},{title:'New collection',description:'Details',cover_image_url:'/cover.jpg',slug:undefined})
    assert.match(rows[0].slug,/^new-collection-\d{4}$/)
  }finally{await page.close()}
})
test('gallery arrow navigation and zoom remain available',async()=>{
  const page=await start(375,false)
  try{
    await page.locator('#lightbox-trigger').click()
    await page.keyboard.press('ArrowRight')
    await page.getByText('2 / 2',{exact:true}).waitFor()
    await page.getByRole('button',{name:'Zoom',exact:true}).click()
    assert.equal(await page.getByRole('button',{name:'Fit',exact:true}).count(),1)
    assert.equal(await page.locator('[aria-pressed=true]').count(),1)
    await page.keyboard.press('Escape')
    await closed(page,'#lightbox-trigger')
  }finally{await page.close()}
})
for(const kind of ['shipping','cart','series','lightbox','reveal','catalog']) {
  test(`${kind} unmount releases scroll and inert background`,async()=>{
    const page=await start(375,true)
    try{
      await page.locator('#'+kind+'-trigger').click()
      if(kind==='catalog') await page.getByRole('button',{name:/^Filters/}).click()
      await page.getByRole('dialog').waitFor()
      await page.evaluate(()=>window.overlayFixture.dispose())
      assert.equal(await page.evaluate(()=>document.body.style.overflow),'auto')
      assert.equal(await page.locator('#root').evaluate(el=>el.inert),false)
      if(kind==='shipping') await page.waitForFunction(()=>window.overlayFixture.checkout?.error==='shipping_destination_required')
      const prevented=await page.evaluate(()=>{const e=new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});document.dispatchEvent(e);return e.defaultPrevented})
      assert.equal(prevented,false)
    }finally{await page.close()}
  })
}
test('reveal finish timer is cleared on unmount',async()=>{
  const page=await start(375,true)
  try{
    await page.locator('#reveal-trigger').click()
    await page.getByRole('button',{name:'Skip',exact:true}).click()
    await page.evaluate(()=>window.overlayFixture.unmount())
    await page.waitForTimeout(800)
    assert.equal(await page.evaluate(()=>window.overlayFixture.doneCount),0)
  }finally{await page.close()}
})
test('reduced motion skips cinematic reveal without residual effects',async()=>{
  const page=await start(375,true)
  try{
    await page.emulateMedia({reducedMotion:'reduce'})
    await page.locator('#reveal-trigger').click()
    await page.waitForFunction(()=>window.overlayFixture.doneCount===1)
    assert.equal(await page.getByRole('dialog').count(),0)
    assert.equal(await page.evaluate(()=>document.body.style.overflow),'auto')
  }finally{await page.close()}
})
test('short mobile viewport keeps cart footer reachable',async()=>{
  const page=await start(375,true)
  try{
    await page.setViewportSize({width:375,height:480})
    await page.locator('#cart-trigger').click()
    const checkout=page.getByRole('button',{name:'Checkout prints',exact:true})
    await checkout.scrollIntoViewIfNeeded()
    const r=await checkout.boundingBox()
    assert.ok(r.y>=0&&r.y+r.height<=480)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  }finally{await page.close()}
})


test('nested shipping prompt suspends the cart trap and restores the parent lock/focus',async()=>{
  const page=await start(1440,true)
  try{
    await page.locator('#cart-trigger').click()
    await page.getByRole('dialog').evaluate(el=>{
      const button=document.createElement('button');button.id='nested-shipping-trigger';button.textContent='Choose shipping';
      button.onclick=()=>window.dispatchEvent(new CustomEvent('jbu:shipping-destination',{detail:{countries:['CA','US'],resolve:value=>window.overlayFixture.nestedResult=value}}));
      el.append(button);button.focus()
    })
    await page.locator('#nested-shipping-trigger').click()
    await page.getByRole('dialog',{name:'Shipping destination',exact:true}).waitFor()
    assert.equal(await page.getByRole('dialog',{name:'Shipping destination',exact:true}).evaluate(el=>el.contains(document.activeElement)),true)
    await page.keyboard.press('Escape')
    await page.getByRole('dialog',{name:'Shipping destination',exact:true}).waitFor({state:'hidden'})
    assert.equal(await page.locator('#nested-shipping-trigger').evaluate(el=>el===document.activeElement),true)
    assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden')
    assert.equal(await page.evaluate(()=>window.overlayFixture.nestedResult),null)
    await page.keyboard.press('Escape')
    await closed(page,'#cart-trigger')
  }finally{await page.close()}
})
test('existing nested Carbon payment dialog owns Escape without dismissing the cart',async()=>{
  const page=await start(1440,true)
  try{
    await page.addInitScript(()=>{window.fixtureOriginal=true;document.cookie='jbu-market=MX;Path=/'})
    await page.reload()
    await page.waitForFunction(()=>window.overlayFixture?.ready)
    await page.evaluate(()=>document.body.style.overflow='auto')
    await page.locator('#cart-trigger').click()
    await page.getByRole('button',{name:'Proceed to payment',exact:true}).click()
    const nested=page.getByRole('dialog',{name:'Payment method',exact:true})
    await nested.waitFor()
    await page.waitForTimeout(150)
    await page.keyboard.press('Escape')
    await nested.waitFor({state:'hidden'})
    assert.equal(await page.getByRole('dialog').count(),1)
    assert.equal(await page.getByRole('dialog').evaluate(el=>el.contains(document.activeElement)),true)
    assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden')
    await page.keyboard.press('Escape')
    await closed(page,'#cart-trigger')
  }finally{await page.close()}
})
test('cart backdrop dismisses and restores its launcher; pre-existing inert state survives',async()=>{
  const page=await start(1440,false)
  try{
    await page.evaluate(()=>{const n=document.createElement('div');n.id='prior-inert';n.inert=true;document.body.append(n)})
    await page.locator('#cart-trigger').click()
    await page.getByRole('dialog').waitFor()
    await page.mouse.click(5,100)
    await closed(page,'#cart-trigger')
    assert.equal(await page.locator('#prior-inert').evaluate(el=>el.inert),true)
  }finally{await page.close()}
})
test('200% reflow approximation: 720 CSS pixels on 1440 device pixels with scrolling modal content',async()=>{
  const page=await start(720,true,2)
  try{
    await page.setViewportSize({width:720,height:450})
    await page.locator('#series-trigger').click()
    await page.getByRole('dialog').waitFor()
    await page.locator('.cds--modal-content').evaluate(el=>{for(let i=0;i<20;i++){const p=document.createElement('p');p.textContent='Long dialog content must scroll within its own region.';el.append(p)}})
    const footer=page.getByRole('button',{name:'Create Series',exact:true})
    const r=await footer.boundingBox()
    assert.ok(r.y>=0&&r.y+r.height<=450)
    assert.equal(await page.locator('.cds--modal-content').evaluate(el=>el.scrollHeight>el.clientHeight),true)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    if(evidence) await page.screenshot({path:path.join(path.dirname(evidence),'series-reflow-after.png')})
  }finally{await page.close()}
})


for(const dark of [false,true]) test(`Spanish country, shipping, cart and series labels ${dark?'dark':'light'}`,async()=>{
  const page=await start(375,dark,1,'es')
  try{
    await page.getByRole('button',{name:'País de compra',exact:true}).click()
    await page.getByRole('heading',{name:'Tu país de compra',exact:true}).waitFor()
    assert.equal(await page.getByRole('combobox').count(),1)
    await page.keyboard.press('Escape')
    await page.locator('#shipping-trigger').click()
    await page.getByRole('dialog',{name:'Destino de envío',exact:true}).waitFor()
    assert.equal(await page.getByLabel('País',{exact:true}).count(),1)
    await page.keyboard.press('Escape')
    await page.locator('#cart-trigger').click()
    await page.getByRole('dialog',{name:/Tu carrito/}).waitFor()
    await page.keyboard.press('Escape')
    await page.locator('#series-trigger').click()
    await page.getByLabel('Título de la Serie',{exact:true}).waitFor()
    await page.getByRole('button',{name:'Cerrar',exact:true}).click()
    await closed(page,'#series-trigger')
  }finally{await page.close()}
})


test('pending series submit disables implicit Enter submission as well as the footer button',async()=>{
  const page=await start(375,false)
  try{
    await page.evaluate(()=>window.fixtureDelayInsert=true)
    await page.locator('#series-trigger').click()
    await page.getByLabel('Series title',{exact:true}).fill('Pending series')
    await page.keyboard.press('Enter')
    await page.waitForFunction(()=>Boolean(window.overlayFixture.finishInsert))
    assert.equal(await page.getByRole('button',{name:'Saving...',exact:true}).isDisabled(),true)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    assert.equal(await page.evaluate(()=>window.overlayFixture.insertCount),1)
    await page.evaluate(()=>window.overlayFixture.finishInsert())
    await closed(page,'#series-trigger')
  }finally{await page.close()}
})


test('missing reveal source completes once through StrictMode effect replay',async()=>{
  const page=await start(375,true)
  try{
    await page.evaluate(()=>window.fixtureRevealWaiting=false)
    await page.locator('#reveal-trigger').click()
    await page.waitForFunction(()=>window.overlayFixture.doneCount===1)
    await closed(page,'#reveal-trigger')
  }finally{await page.close()}
})
