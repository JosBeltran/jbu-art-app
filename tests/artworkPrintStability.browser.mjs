/** Real React/Carbon components; only IO/router boundaries are mocked. */
import {before,after,test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import http from 'node:http'
const root=fileURLToPath(new URL('../',import.meta.url))
const require=createRequire(path.join(process.env.JBU_BROWSER_TOOLS||root,'package.json'))
const {build}=require('esbuild'),{chromium}=require('playwright')
const ref=process.env.JBU_STABILITY_REF
const report={source:ref||'working tree',checks:[],measurements:[],limits:'Isolated real components and Carbon/app CSS; no live admin, providers, payments or DB.'}
let scratch,server,browser,origin
before(async()=>{
  scratch=await mkdtemp(path.join(tmpdir(),'jbu-detail-studio-'))
  const mocks={
    'next/link':`export default function Link(p){return <a {...p}/>} `,
    'next/navigation':`export const useRouter=()=>({push(url){window.fixture.navigation=url},refresh(){},replace(){}});export const useSearchParams=()=>new URLSearchParams(location.search);`,
    '@/components/I18nProvider':`export const useLocalized=()=>((r,k)=>window.fixture?.lang==='en'?(r?.[k+'_en']||r?.[k]):r?.[k]);export const useI18n=()=>({lang:window.fixture?.lang||window.fixtureLang||'en',locale:window.fixture?.lang==='es'?'es-MX':'en-US',t:(es,en)=>window.fixture?.lang==='es'?es:en});`,
    '@/components/CurrencyProvider':`export const useCurrency=()=>({currency:'MXN',price:n=>({text:'$'+n,amount:'$'+n,currency:'MXN'}),total:()=>({text:'$100'})});export const ExchangeNote=()=>null;`,
    '@/lib/supabaseClient':`export const supabase={auth:{getSession:async()=>({data:{session:window.fixture.user?{user:window.fixture.user}:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:table=>window.fixture.db(table),rpc:async()=>({data:{available:8,reserved:1,sold:11,edition_size:20,sales_enabled:true}})};`,
    '@supabase/supabase-js':`import {supabase} from '@/lib/supabaseClient';export const createClient=()=>supabase;`,
    '@/lib/artworks':`export const getArtworks=async()=>window.fixture.related;`,
    '@/lib/auctions':`export const fetchArtworkAuction=async()=>null;export const bidErrorText=()=>'';export const clockOffset=()=>0;export const fetchAuction=async()=>null;export const fetchBidHistory=async()=>[];export const fetchMyState=async()=>null;export const placeBid=async()=>{};export const startAuctionCheckout=async()=>{};export const subscribeAuctionTicks=()=>()=>{};export const unwatchAuction=async()=>{};export const watchAuction=async()=>{};`,
    '@/lib/payments/pending.client':`export const fetchPayment=async()=>null;export const payPending=async()=>{};`,
    '@/components/consent/CookieConsent':`export const useCookieConsent=()=>({consent:{analytics:false}});`,
    '@/components/market/MarketProvider':`export const useMarket=()=>({country:window.fixture.country});`,
    '@/components/shipping/usePurchaseShipping':`export const usePurchaseShipping=()=>({loaded:true,error:null});`,
    '@/components/shipping/ShippingProvider':`export const useShipping=()=>({globalCountries:['MX','US'],loaded:true,policies:[],defaults:{}});export const shippingCheckoutFetch=(url,options)=>fetch(url,options);`,
    '@/context/CartContext':`export const savePendingAction=action=>window.fixture.pendingAction=action;export const useCart=()=>({cart:window.fixture.cart,user:window.fixture.user,addToCart:async item=>window.fixture.cart.push(item)});`,
    '@/lib/authHeaders':`export const authHeaders=async()=>({});`,
    '@/components/media/OptimizedImg':`export default function Image({src,alt,className,style}){return <img src={src} alt={alt} className={className} style={style}/>} `,
  }
  await build({entryPoints:[path.join(root,'tests/fixtures/artworkPrintStability.jsx')],bundle:true,define:{'process.env':'{}','process.env.NEXT_PUBLIC_SUPABASE_URL':'"https://example.supabase.co"','process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY':'"fixture"'},outfile:path.join(scratch,'bundle.js'),jsx:'automatic',alias:{'@':root},nodePaths:[path.join(root,'node_modules')],plugins:[{name:'stability-boundaries',setup(builder){
    builder.onResolve({filter:/^(next\/|@\/|@supabase\/)/},args=>mocks[args.path]?{path:args.path,namespace:'mock'}:undefined)
    builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'jsx',resolveDir:root}))
    builder.onLoad({filter:/(UnifiedStudio\.jsx|studioDiscovery\.js|ArtworkDetailClient\.tsx|ArtworkDetail\.module\.css|MediaGallery\.module\.css)$/},async args=>{
      const relative=path.relative(root,args.path)
      let contents=ref?execFileSync('git',['show',ref+':'+relative],{cwd:root,encoding:'utf8'}):await readFile(args.path,'utf8')
      if(relative.endsWith('UnifiedStudio.jsx'))contents=contents.replace("  const { t, lang } = useI18n()","  window.fixture.parentRenders++;\n  const { t, lang } = useI18n()")
      else if(relative.endsWith('studioDiscovery.js'))contents=contents.replace('export function studioMatches(group, query) {','export function studioMatches(group, query) {\n  window.fixture.matches++;')
      return {contents,loader:relative.endsWith('.css')?'local-css':relative.endsWith('.tsx')?'tsx':relative.endsWith('.jsx')?'jsx':'js',resolveDir:path.dirname(args.path)}
    })
  }}]})
  const appRequire=createRequire(path.join(root,'package.json'))
  const globals=(await appRequire('postcss')([appRequire('@tailwindcss/postcss')({base:root})]).process(await readFile(path.join(root,'app/globals.css'),'utf8'),{from:path.join(root,'app/globals.css')})).css
  const carbon=await readFile(path.join(root,'node_modules/@carbon/styles/css/styles.css'),'utf8')
  await writeFile(path.join(scratch,'index.html'),`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:Plex;src:url(/font.woff)}:root{--font-plex-sans:Plex;--font-plex-mono:monospace}${carbon}\n${globals}</style><link rel="stylesheet" href="/bundle.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`)
  server=http.createServer(async(req,res)=>{
    if(req.url.startsWith('/art')){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#e8daff"/><circle cx="300" cy="400" r="180" fill="#6929c4"/></svg>');return}
    if(req.url==='/font.woff'){res.end(await readFile(path.join(root,'public/social/IBMPlexSans-Regular.woff')));return}
    const file={'/':'index.html','/bundle.js':'bundle.js','/bundle.css':'bundle.css'}[req.url.split('?')[0]]
    if(!file){res.writeHead(404).end();return}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(path.join(scratch,file)))
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port
  browser=await chromium.launch({headless:true,...(process.env.JBU_CHROMIUM_PATH?{executablePath:process.env.JBU_CHROMIUM_PATH}:{}),args:['--no-sandbox']})
})
after(async()=>{
  if(process.env.JBU_STABILITY_EVIDENCE){await mkdir(path.dirname(process.env.JBU_STABILITY_EVIDENCE),{recursive:true});await writeFile(process.env.JBU_STABILITY_EVIDENCE,JSON.stringify(report,null,2)+'\n')}
  await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));if(scratch)await rm(scratch,{recursive:true,force:true})
})
async function open(lang='en',screen='',width=1440,dark=false,edition=false){
  const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(8000);page.on('pageerror',error=>console.error('PAGE',error.stack))
  await page.addInitScript(({lang,dark,edition})=>{window.fixtureLang=lang;window.fixtureDark=dark;window.fixtureEdition=edition},{lang,dark,edition});await page.goto(origin+(screen?'/?screen='+screen:''));if(screen!=='detail')await page.getByRole('heading',{name:screen==='manager'?'Products':'Product Studio',exact:true}).waitFor();else await page.getByRole('heading',{level:1}).waitFor();return page
}
async function editor(page){
  await page.getByText('Resume a previous session',{exact:true}).click()
  await page.getByRole('button',{name:'La memoria del agua',exact:true}).click()
  await page.getByRole('button',{name:'Configure product',exact:true}).first().click()
  await page.locator('#studio-exact-configuration').selectOption({index:1})
  await page.getByRole('button',{name:'Add configuration',exact:true}).click()
  await page.getByRole('button',{name:'Continue',exact:true}).click()
  await page.getByRole('button',{name:'Continue',exact:true}).click()
  await page.getByLabel('Title · ES',{exact:true}).waitFor()
}
test('editor keystrokes do not rebuild hidden discovery or lose focus',async()=>{
  const page=await open()
  try{
    await editor(page)
    const field=page.getByLabel('Description · EN',{exact:true})
    await field.focus();await field.evaluate(el=>window.editNode=el)
    const before=await page.evaluate(()=>({renders:fixture.parentRenders,matches:fixture.matches,requests:fixture.requests.length,scroll:scrollY}))
    await field.press('End');await page.keyboard.type(' A detailed description typed one character at a time.')
    const after=await page.evaluate(()=>({renders:fixture.parentRenders,matches:fixture.matches,requests:fixture.requests.length,scroll:scrollY,same:document.activeElement===window.editNode&&window.editNode===document.querySelector('[id^=descriptionEn-]')}))
    report.measurements.push({before,after})
    assert.equal(after.same,true,'same focused input node')
    assert.equal(after.requests,before.requests,'no provider operations while typing')
    assert.equal(after.matches,before.matches,'hidden catalog must not be normalized per character')
    assert.ok(after.renders-before.renders<=2,'typing stays in the editor, not the whole wizard')
  }finally{await page.close()}
})

test('editor preserves all text, caret, prices and draft across steps and failed costs',async()=>{
 const page=await open()
 try{
  await editor(page)
  const expected={}
  const title=page.getByLabel('Title · ES',{exact:true});await title.fill('')
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='Continue'&&button.disabled))
  assert.equal(await page.getByRole('button',{name:'Continue',exact:true}).isDisabled(),true)
  await title.fill('Valid draft')
  await page.evaluate(()=>fixture.language('es'))
  await page.getByLabel('Título · ES',{exact:true}).press('End');await page.keyboard.type(' en español')
  assert.equal(await page.getByLabel('Título · ES',{exact:true}).inputValue(),'Valid draft en español')
  await page.evaluate(()=>fixture.language('en'))
  for(const label of ['Title · ES','Title · EN','Description · ES','Description · EN']){
   const input=page.getByLabel(label,{exact:true})
   const value=label.startsWith('Description')?'Long description '.repeat(100):'Authored '+label
   await input.fill(value);await input.focus()
   await input.evaluate(el=>{el.setSelectionRange(3,3);window.editNode=el})
   await page.keyboard.type('XYZ')
   assert.equal(await input.inputValue(),value.slice(0,3)+'XYZ'+value.slice(3))
   assert.equal(await input.evaluate(el=>el===window.editNode&&document.activeElement===el&&el.selectionStart===6),true)
   expected[label]=await input.inputValue()
  }
  await page.locator('#wall-price-book').selectOption('mx')
  const retail=page.locator('input[id^="wall-price-"]');await retail.fill('1250')
  await page.locator('#wall-margin').fill('35')
  await page.evaluate(()=>fixture.fail='wallArtCosts')
  await page.getByRole('button',{name:'Get costs',exact:true}).click()
  await page.getByText('provider unreachable',{exact:false}).waitFor()
  for(const [label,value] of Object.entries(expected))assert.equal(await page.getByLabel(label,{exact:true}).inputValue(),value)
  await page.getByRole('button',{name:'Back',exact:true}).click()
  await page.getByRole('button',{name:'Continue',exact:true}).click()
  for(const [label,value] of Object.entries(expected))assert.equal(await page.getByLabel(label,{exact:true}).inputValue(),value)
  assert.equal(await retail.inputValue(),'1250');assert.equal(await page.locator('#wall-margin').inputValue(),'35')
  await page.getByRole('button',{name:'Continue',exact:true}).click()
  await page.getByRole('button',{name:'Save drafts',exact:true}).click()
  await page.getByRole('heading',{name:'Drafts saved',exact:true}).waitFor()
  const saved=await page.evaluate(()=>fixture.saved)
  assert.equal(saved.products[0].titleEs,expected['Title · ES'])
  await page.goto(origin+'/?screen=manager&id=saved-product')
  await page.getByText('Edit content',{exact:true}).click()
  assert.equal(await page.getByLabel('Spanish title',{exact:true}).inputValue(),expected['Title · ES'])
  const reopened=page.getByLabel('English description',{exact:true});await reopened.fill('Reopened edit')
  await page.getByRole('button',{name:'Save',exact:true}).click()
  await page.waitForFunction(()=>fixture.edited?.descriptionEn==='Reopened edit')
  report.checks.push('all editorial fields retain caret and content; prices/margin survive steps; failed costs preserve draft; save payload retains edits')
 }finally{await page.close()}
})

test('artwork editorial layout adapts in both themes and languages',async()=>{
 for(const width of [375,768,1024,1440])for(const dark of [false,true]){
  const page=await open(dark?'es':'en','detail',width,dark)
  try{
   await page.waitForTimeout(300)
   const geometry=await page.evaluate(()=>{
    const find=name=>document.querySelector('[class*="'+name+'"]')
    const box=name=>{const e=find(name);return e?{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width}:null}
    return {overflow:document.documentElement.scrollWidth>innerWidth,hero:box('heroGallery'),info:box('information'),history:box('history'),columns:find('editorialRow')?getComputedStyle(find('editorialRow')).gridTemplateColumns:null,errors:fixture.errors}
   })
   assert.equal(geometry.overflow,false,JSON.stringify({width,dark,geometry}))
   assert.deepEqual(geometry.errors,[])
   if(width>=1024){assert.ok(geometry.history.x>geometry.info.x);assert.ok(Math.abs(geometry.history.y-geometry.info.y)<2)}
   else if(width===375)assert.ok(geometry.history.y>geometry.info.y)
   await page.getByText(dark?'Resina sobre madera':'Resin on wood',{exact:true}).waitFor()
   assert.ok((await page.getByRole('heading',{level:1}).innerText()).includes('La memoria del agua'))
   report.checks.push(`artwork ${width}px ${dark?'dark ES':'light EN'}: no overflow, localized medium, original title, editorial geometry`)
   if(width===1440&&process.env.JBU_STABILITY_EVIDENCE)await page.screenshot({path:path.join(path.dirname(process.env.JBU_STABILITY_EVIDENCE),'artwork-'+(dark?'dark-es':'light-en')+'.png'),fullPage:true})
  }finally{await page.close()}
 }
})


test('overlapping reads reject stale responses and cancel independent keys on teardown',async()=>{
 const page=await open()
 try{
  const result=await page.evaluate(()=>{
   const first=fixture.reads.begin('catalog'),cost=fixture.reads.begin('cost'),second=fixture.reads.begin('catalog')
   const before={oldAborted:first.signal.aborted,oldCurrent:first.current(),newCurrent:second.current(),costCurrent:cost.current()}
   fixture.reads.cancel()
   return {before,after:second.current(),costAborted:cost.signal.aborted}
  })
  assert.deepEqual(result,{before:{oldAborted:true,oldCurrent:false,newCurrent:true,costCurrent:true},after:false,costAborted:true})
 }finally{await page.close()}
})


test('delayed costs do not overwrite text and Limited Edition retains registration guard',async()=>{
 const page=await open()
 try{
  await editor(page);await page.locator('#wall-price-book').selectOption('mx')
  await page.evaluate(()=>fixture.defer='wallArtCosts')
  await page.getByRole('button',{name:'Get costs',exact:true}).click()
  const title=page.getByLabel('Title · ES',{exact:true});await title.fill('Draft while waiting')
  await page.evaluate(()=>fixture.release('wallArtCosts'))
  await page.getByRole('button',{name:'Get costs',exact:true}).waitFor({state:'visible'})
  assert.equal(await title.inputValue(),'Draft while waiting')
 }finally{await page.close()}
 const detail=await open('en','detail',1024,false,true)
 try{
  assert.equal(await detail.getByText('Physical record and registration',{exact:true}).count(),0)
  assert.equal(await detail.getByText('Do you already own this piece?',{exact:true}).count(),0)
  await detail.getByRole('button',{name:'Enlarge image',exact:true}).first().click()
  await detail.getByRole('dialog').waitFor()
 }finally{await detail.close()}
})


test('artwork gallery, discussions, QR, cart and checkout sign-in remain available',async()=>{
 const page=await open('en','detail')
 try{
  await page.evaluate(()=>fixture.market(null))
  await page.getByRole('tab',{name:'View image 2',exact:true}).click()
  assert.equal(await page.getByRole('tab',{name:'View image 2',exact:true}).getAttribute('aria-selected'),'true')
  await page.getByRole('button',{name:'Discuss the artwork',exact:true}).click()
  await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'Add to cart',exact:true}).click()
  await page.waitForFunction(()=>fixture.cart.length===1)
  await page.getByRole('button',{name:'Buy now',exact:true}).click()
  await page.waitForFunction(()=>fixture.pendingAction?.type==='buy'&&fixture.navigation?.startsWith('/login?'))
  const download=page.waitForEvent('download')
  await page.getByRole('button',{name:'Download QR as SVG',exact:true}).click()
  assert.equal((await download).suggestedFilename(),'QR-ART-1.svg')
 }finally{await page.close()}
})

test('provider switch retains Gelato configuration and adds Prodigi through same wizard',async()=>{
 const page=await open()
 try{
  await editor(page)
  for(let i=0;i<3;i++)await page.getByRole('button',{name:'Back',exact:true}).click()
  await page.locator('#studio-provider').selectOption('prodigi')
  await page.getByRole('button',{name:'Configure product',exact:true}).first().click()
  await page.getByRole('button',{name:'Add configuration',exact:true}).click()
  await page.getByRole('button',{name:'Continue',exact:true}).click()
  await page.getByRole('button',{name:'Continue',exact:true}).click()
  assert.equal(await page.getByLabel('Title · ES',{exact:true}).count(),2)
  const providers=await page.evaluate(()=>fixture.requests.filter(r=>r.operation==='addCandidate').map(r=>r.input.provider))
  assert.deepEqual(providers,['gelato','prodigi'])
 }finally{await page.close()}
})
