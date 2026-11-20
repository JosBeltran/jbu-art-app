/* eslint-disable @typescript-eslint/no-require-imports -- Optional isolated browser harness. */
const assert=require('node:assert/strict')
const fs=require('node:fs/promises')
const os=require('node:os')
const path=require('node:path')
const http=require('node:http')
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const esbuild=require(process.env.ESBUILD_MODULE || 'esbuild')
const root=path.resolve(__dirname,'..')
const art='10000000-0000-4000-8000-000000000001'
const session='10000000-0000-4000-8000-000000000002'
const book='10000000-0000-4000-8000-000000000003'
const product='10000000-0000-4000-8000-000000000005'
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#356875"/></svg>')

;(async()=>{
  const {providerNativeService}=await import('../lib/productCatalog/providerNative.server.js')
  const {gelatoAdapter}=await import('../lib/productCatalog/providers.js')
  const {nativeGelatoFetch,nativeProducts}=await import('./fixtures/nativeProviderCatalog.js')
  const cache=new Map()
  const db={from(table){assert.equal(table,'provider_metadata_cache');let key='';return {select(){return this},eq(field,value){if(field==='cache_key')key=value;return this},async maybeSingle(){return {data:cache.get(key)||null}},async upsert(row){cache.set(row.cache_key,row);return {data:null}}}}}
  const engine=providerNativeService(db,()=>gelatoAdapter('fixture-only',nativeGelatoFetch()))
  const output=await fs.mkdtemp(path.join(os.tmpdir(),'jbu-supplier-browser-'))
  let browser
  const server=http.createServer(async(req,res)=>{
    const filename=req.url.startsWith('/bundle.css') ? 'bundle.css' : req.url.startsWith('/bundle.js') ? 'bundle.js' : null
    res.setHeader('Content-Type',filename?.endsWith('.css') ? 'text/css' : filename ? 'text/javascript' : 'text/html')
    res.end(filename ? await fs.readFile(path.join(output,filename)) : '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"></head><body style="margin:0"><main id="root"></main><script src="/bundle.js"></script></body></html>')
  })
  try {
    await esbuild.build({absWorkingDir:root,entryPoints:['tests/fixtures/supplierCatalog.jsx'],bundle:true,outfile:path.join(output,'bundle.js'),jsx:'automatic',
      alias:{'@':root},define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},loader:{'.woff2':'empty','.woff':'empty'},plugins:[{
        name:'isolated-auth-and-localization',setup(build){
          build.onResolve({filter:/I18nProvider$/},()=>({path:'locale',namespace:'fixture'}))
          build.onResolve({filter:/authHeaders$/},()=>({path:'auth',namespace:'fixture'}))
          build.onLoad({filter:/.*/,namespace:'fixture'},({path:name})=>({loader:'js',contents:name==='auth'
            ? 'export const authHeaders=async()=>({Authorization:"Bearer fixture-admin"})'
            : 'const lang=new URLSearchParams(location.search).get("lang") || "en";const t=(es,en)=>lang==="es"?es:en??es;export const useI18n=()=>({lang,t});export const useLocalized=()=>record=>record;export const localized=(record,field)=>record?.[field];'}))
        }
      }]})
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']})
    for(const [width,lang,theme] of [[1366,'en','white'],[390,'es','g100']]) {
      const page=await browser.newPage({viewport:{width,height:900}})
      page.setDefaultTimeout(10000)
      const requests=[];const errors=[]
      let initialConfigurationFailure=true
      page.on('pageerror',error=>errors.push(error.message))
      await page.route('**/api/admin/product-catalog',async route=>{
        const {operation,input}=route.request().postDataJSON()
        requests.push({operation,input})
        let data
        switch(operation) {
          case 'listSessions':data=[];break
          case 'artworkSearch':data=[{id:art,title:'Urban Totem N° 02 — Architectures of Memory',title_en:'Urban Totem N° 02 — Architectures of Memory',sku:'URBAN-02',primary_image_url:image}];break
          case 'artworkAssets':data={artwork:{id:art,title:'Urban Totem N° 02 — Architectures of Memory',title_en:'Urban Totem N° 02 — Architectures of Memory',sku:'URBAN-02',primary_image_url:image},
            assets:[{id:art,asset_type:'photo',public_url:image,width_px:3000,height_px:6000}],revisions:[]};break
          case 'createSession':data={id:session,artwork_id:art,criteria:input};break
          case 'list':data={books:[{id:book,country:'MX',currency:'MXN',status:'draft',name:'Mexico'}]};break
          case 'nativeDiscover':data=await engine.nativeDiscover(input);break
          case 'nativeConfigure':
            if(initialConfigurationFailure) {
              initialConfigurationFailure=false
              await route.fulfill({status:502,json:{error:'invalid_provider_response',providerOperation:'catalog_definition',responseField:'productAttributes'}})
              return
            }
            data=await engine.nativeConfigure(input);break
          case 'addNativeCandidate':await engine.nativeResolve(input);data={id:'10000000-0000-4000-8000-000000000004'};break
          case 'studioVariantCost':data={country:'MX',currency:'MXN',manufacturingMinor:10000};break
          case 'saveWallArtDrafts':data=[product];break
          default:throw new Error('Unexpected API operation '+operation)
        }
        await route.fulfill({json:data})
      })
      const es=lang==='es'
      await page.goto(`http://127.0.0.1:${server.address().port}/?lang=${lang}&theme=${theme}`)
      await page.getByLabel(es?'Título de la obra':'Artwork title',{exact:true}).fill('Urban Totem')
      await page.getByRole('button',{name:es?'Buscar obras':'Find artworks',exact:true}).click()
      await page.getByRole('button',{name:/Urban Totem N° 02/}).click()
      await page.getByRole('button',{name:es?'Elegir productos':'Choose products',exact:true}).click()
      await page.getByRole('heading',{name:es?'Analizar obra':'Analyze artwork',exact:true}).waitFor()
      await page.getByText(/3000 × 6000 px/).waitFor()
      await page.getByRole('button',{name:es?'Continuar':'Continue',exact:true}).click()
      await page.getByRole('heading',{name:es?'Póster enmarcado':'Framed poster',exact:true}).waitFor()
      assert.equal(requests.some(row=>/supplierSync|studioDiscover|studioVariants/.test(row.operation)),false)
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
      await page.getByRole('button',{name:es?'Configurar presentación':'Configure presentation',exact:true}).click()
      await page.getByRole('alert').filter({hasText:'invalid_provider_response · catalog_definition · productAttributes'}).waitFor()
      assert.equal(await page.getByRole('button',{name:es?'Agregar configuración':'Add configuration',exact:true}).isDisabled(),true)
      await page.getByRole('button',{name:es?'Reintentar':'Retry',exact:true}).click()
      const size=page.getByLabel(es?'Tamaño de papel':'Paper size',{exact:true})
      await size.waitFor()
      await size.selectOption('A2')
      await page.waitForTimeout(400)
      const frame=page.getByLabel(es?'Color del marco':'Frame color',{exact:true})
      await frame.waitFor()
      assert.equal(await frame.locator('option[value="natural-wood"]').count(),0)
      await size.selectOption('')
      await page.waitForTimeout(400)
      await size.selectOption('A3')
      await page.waitForTimeout(400)
      await frame.selectOption('natural-wood')
      await page.waitForTimeout(400)
      assert.equal(requests.filter(row=>row.operation==='addNativeCandidate').length,0)
      assert.equal(requests.filter(row=>row.operation==='saveWallArtDrafts').length,0)
      await page.getByRole('button',{name:es?'Consultar costo de fabricación':'Request manufacturing cost',exact:true}).click()
      await page.getByText(es?'Solo fabricación; envío e impuestos pendientes.':'Manufacturing only; shipping and tax pending.',{exact:false}).waitFor()
      await page.getByText(/362 (ppp estimados|estimated dpi)/).waitFor()
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
      await page.getByRole('button',{name:es?'Agregar configuración':'Add configuration',exact:true}).click()
      const chosen=requests.find(row=>row.operation==='addNativeCandidate').input
      assert.equal(chosen.variantId,nativeProducts[1].productUid)
      assert.deepEqual(chosen.selection,{PaperFormat:'A3',FrameColor:'natural-wood'})
      assert.equal(requests.some(row=>/supplierSync|studioDiscover|studioVariants/.test(row.operation)),false)
      await page.getByRole('button',{name:es?'Continuar':'Continue',exact:true}).click()
      await page.getByRole('heading',{name:es?'Mockups e imágenes comerciales':'Mockups and commercial images',exact:true}).waitFor()
      await page.getByRole('button',{name:es?'Continuar':'Continue',exact:true}).click()
      await page.getByRole('heading',{name:es?'Precios por mercado':'Market prices',exact:true}).waitFor()
      await page.getByRole('button',{name:es?'Continuar':'Continue',exact:true}).click()
      await page.getByRole('button',{name:es?'Guardar borradores':'Save drafts',exact:true}).click()
      await page.getByRole('link',{name:es?'Abrir producto':'Open product',exact:true}).waitFor()
      assert.equal(requests.filter(row=>row.operation==='saveWallArtDrafts').length,1)
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
      assert.deepEqual(errors,[])
      if(process.env.JBU_VISUAL_DIR){await fs.mkdir(process.env.JBU_VISUAL_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.JBU_VISUAL_DIR,`catalog-${width}-${lang}-${theme}.png`),fullPage:true})}
      await page.close()
      console.log(`PASS provider-native discovery/configuration/save ${width}px ${lang} ${theme}`)
    }
  } finally {
    await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(output,{recursive:true,force:true})
  }
})().catch(error=>{console.error(error);process.exitCode=1})
