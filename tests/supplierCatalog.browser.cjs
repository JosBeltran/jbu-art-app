/* eslint-disable @typescript-eslint/no-require-imports -- Optional isolated browser harness. */
const assert=require('node:assert/strict')
const fs=require('node:fs/promises')
const os=require('node:os')
const path=require('node:path')
const http=require('node:http')
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const esbuild=require(process.env.ESBUILD_MODULE || 'esbuild')
const root=path.resolve(__dirname,'..')
const art='10000000-0000-4000-8000-000000000001',session='10000000-0000-4000-8000-000000000002',book='10000000-0000-4000-8000-000000000003',product='10000000-0000-4000-8000-000000000005'
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#356875"/></svg>')
;(async()=>{
  const {providerNativeService}=await import('../lib/productCatalog/providerNative.server.js')
  const {gelatoAdapter}=await import('../lib/productCatalog/providers.js')
  const {operations}=await import('../lib/productCatalog/contracts.js')
  const {nativeGelatoFetch}=await import('./fixtures/nativeProviderCatalog.js')
  const {matrixProviderFetch,matrixProducts}=await import('./fixtures/matrixProviderCatalog.js')
  const output=await fs.mkdtemp(path.join(os.tmpdir(),'jbu-matrix-browser-'))
  let browser
  const server=http.createServer(async(req,res)=>{
    const filename=req.url.startsWith('/bundle.css')?'bundle.css':req.url.startsWith('/bundle.js')?'bundle.js':null
    res.setHeader('Content-Type',filename?.endsWith('.css')?'text/css':filename?'text/javascript':'text/html')
    res.end(filename?await fs.readFile(path.join(output,filename)):'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"></head><body style="margin:0"><main id="root"></main><script src="/bundle.js"></script></body></html>')
  })
  try {
    await esbuild.build({absWorkingDir:root,entryPoints:['tests/fixtures/supplierCatalog.jsx'],bundle:true,outfile:path.join(output,'bundle.js'),jsx:'automatic',alias:{'@':root},define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},loader:{'.woff2':'empty','.woff':'empty'},plugins:[{
      name:'isolated-readonly-browser-fixtures',setup(build){
        build.onResolve({filter:/I18nProvider$/},()=>({path:'locale',namespace:'fixture'}))
        build.onResolve({filter:/authHeaders$/},()=>({path:'auth',namespace:'fixture'}))
        build.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}))
        // Customer-preview panel is not mounted in these Admin handoff scenarios.
        build.onResolve({filter:/CommercialPresentations$/},()=>({path:'preview',namespace:'fixture'}))
        build.onLoad({filter:/.*/,namespace:'fixture'},({path:name})=>({loader:'js',contents:name==='auth'?'export const authHeaders=async()=>({Authorization:"Bearer fixture-admin"})':name==='navigation'?'export const useRouter=()=>({push:path=>{const u=new URL(path,location.origin);for(const k of ["lang","theme"]){const v=new URLSearchParams(location.search).get(k);if(v)u.searchParams.set(k,v)}location.assign(u.href)}})':name==='preview'?'export default function Preview(){return null}':'const lang=new URLSearchParams(location.search).get("lang") || "en";const t=(es,en)=>lang==="es"?es:en??es;export const useI18n=()=>({lang,t});export const useLocalized=()=>record=>record;export const localized=(record,field)=>record?.[field];'}))
      }
    }]})
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']})
    for(const [width,lang,theme,mode] of [[1366,'en','white','framed'],[390,'es','g100','framed'],[1366,'en','white','posters'],[390,'es','g100','posters']]) {
      const cache=new Map(),posters=mode==='posters',es=lang==='es',count=2,requests=[],errors=[],candidates=[]
      const db={from(table){assert.equal(table,'provider_metadata_cache');let key='';return {select(){return this},eq(field,value){if(field==='cache_key')key=value;return this},async maybeSingle(){return {data:cache.get(key)||null}},async upsert(row){cache.set(row.cache_key,row);return {data:null}}}}}
      const engine=providerNativeService(db,()=>gelatoAdapter('fixture-only',posters?matrixProviderFetch():nativeGelatoFetch()))
      const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(12000)
      page.on('pageerror',error=>errors.push(error.message))
      let partialFailure=true,savedInput,omitLast=false
      const artData={id:art,title:'Industrial Pulse',title_en:'Industrial Pulse',sku:'PULSE-FIXTURE',primary_image_url:image}
      const books=[{id:book,country:'MX',currency:'MXN',status:'draft',name:'Mexico',channel:'storefront',priority:0}]
      await page.route('**/api/admin/product-catalog',async route=>{
        const {operation,input}=route.request().postDataJSON();requests.push({operation,input})
        assert.equal(operations[operation]?.schema.safeParse(input).success,true,'HTTP contract '+operation)
        let data
        switch(operation) {
          case 'listSessions':data=[];break
          case 'artworkSearch':data=[artData];break
          case 'artworkAssets':data={artwork:artData,assets:[{id:art,asset_type:'original_photo',public_url:image,width_px:3000,height_px:6000,processing_status:'ready'}],
            revisions:[[420,594],[297,420],[210,297]].map(([widthMm,heightMm])=>({widthMm,heightMm,orientation:'portrait',effectiveDpi:300,outputDpi:300}))};break
          case 'createSession':data={id:session,artwork_id:art,criteria:input};break
          case 'list':data={books,products:[],families:[{code:'fine_art_print',label_es:'Impresión Fine Art',label_en:'Fine Art print'}]};break
          case 'nativeDiscover':data=await engine.nativeDiscover(input);break
          case 'nativeMatrixSnapshot':
            // Exercise the paginated fallback and checkpoint recovery in this browser fixture.
            await route.fulfill({status:503,json:{error:'catalog_unavailable'}});return
          case 'nativeMatrixPage':
            if(input.offset===2 && partialFailure){partialFailure=false;await route.fulfill({status:502,json:{error:'invalid_provider_response',providerOperation:'catalog_search',responseField:'products'}});return}
            data=await engine.nativeConfigure(input);if(omitLast)data={...data,candidates:data.candidates.filter(row=>row.externalVariantId!==matrixProducts[2].productUid)};break
          case 'addNativeCandidate': {
            const resolved=await engine.nativeResolve(input)
            const previous=candidates.find(row=>row.input.variantId===input.variantId && JSON.stringify(row.input.configuration)===JSON.stringify(input.configuration))
            const id=previous?.id || `10000000-0000-4000-8000-${String(10+candidates.length).padStart(12,'0')}`
            data={id,catalog_snapshot:resolved.snapshot};if(!previous)candidates.push({...data,input,variant:resolved.variant});break
          }
          case 'removeStudioSelection':data=true;break
          case 'studioVariantCost':data={country:'MX',currency:'MXN',manufacturingMinor:10000};break
          case 'saveWallArtDrafts':savedInput=input;data=[product];break
          case 'productDetails':data={product:{id:product,title_es:savedInput.products[0].titleEs,status:'draft',sku:'JBU-FIXTURE',family_code:'fine_art_print'},
            artworks:[{artworks:artData}],media:[],attributes:[],handoffIssues:[],originals:[],readiness:Object.fromEntries(candidates.map((_,i)=>['variant-'+i,['gallery','price','provider_mapping']])),
            studioSaves:[{session_id:session,product_discovery_sessions:{artwork_id:art,criteria:{workflow:'wall_art',countries:['MX']},state:'drafted'}}],
            selections:candidates.map((row,i)=>({candidate_id:row.id,product_variant_id:'variant-'+i,configuration:{},product_discovery_candidates:{catalog_snapshot:row.catalog_snapshot}})),
            variants:candidates.map((row,i)=>({id:'variant-'+i,title:row.variant.attributes.PaperFormat,sku:'JBU-V'+i,status:'draft',fulfillment_type:'provider',inventory_policy:'made_to_order',allowed_countries:['MX'],price_book_entries:[],product_variant_assets:[],
              product_variant_attribute_values:Object.entries(row.variant.attributes).map(([attribute_code,text_value])=>({attribute_code,text_value})),wall_art_mockups:{source_url:image,scenes:['gallery'],primary_scene:'gallery',fit:'contain',width_mm:row.variant.widthMm,height_mm:row.variant.heightMm},
              provider_product_mappings:[{id:'mapping-'+i,provider_code:'gelato',external_variant_id:row.variant.externalVariantId,enabled:false,validation_status:'unverified'}]}))};break
          default:throw new Error('Unexpected operation '+operation)
        }
        await route.fulfill({json:data})
      })
      await page.goto(`http://127.0.0.1:${server.address().port}/?lang=${lang}&theme=${theme}`)
      await page.getByLabel(es?'Título de la obra':'Artwork title',{exact:true}).fill('Industrial Pulse')
      await page.getByRole('button',{name:es?'Buscar obras':'Find artworks',exact:true}).click()
      await page.getByRole('button',{name:/Industrial Pulse/}).click()
      await page.getByRole('button',{name:es?'Elegir productos':'Choose products',exact:true}).click()
      await page.getByRole('button',{name:es?'Continuar':'Continue',exact:true}).click()
      await page.getByLabel(es?'Categoría':'Category',{exact:true}).selectOption(posters?'posters':'framed')
      const title=posters?(es?'Póster 200 g/m² sin recubrimiento':'200 gsm uncoated poster'):(es?'Póster enmarcado':'Framed poster')
      const presentation=page.getByRole('article').filter({has:page.getByRole('heading',{name:title,exact:true})})
      await presentation.getByRole('heading',{name:title,exact:true}).waitFor()
      assert.equal(requests.filter(row=>['nativeMatrixPage','nativeMatrixSnapshot'].includes(row.operation)).length,0)
      await presentation.getByRole('button',{name:es?'Configurar presentación':'Configure presentation',exact:true}).click()
      await page.getByRole('alert').filter({hasText:'invalid_provider_response'}).waitFor()
      assert.equal(candidates.length,0,'Incomplete discovery creates no selected candidates or products')
      await page.getByRole('button',{name:/^(Reintentar|Retry)/}).click()
      assert.equal(await page.getByLabel(es?'Categoría':'Category',{exact:true}).count(),0)
      await page.getByText(es?'Configuraciones completas para esta presentación y destino.':'Complete configurations for this presentation and destination.',{exact:false}).waitFor()
      const scopeId=posters?'jbu:poster:200gsm-uncoated':'jbu:framed_print:framed-posters'
      const offsets=requests.filter(row=>row.operation==='nativeMatrixPage' && row.input.presentationId===scopeId).map(row=>row.input.offset)
      assert.deepEqual(offsets,posters?[0,2,2,3]:[0,2,2])
      assert.equal(await page.getByRole('button',{name:/^(Next|Previous|Siguiente|Anterior)$/}).count(),0)
      assert.equal(await page.locator('select[id*=State],select[id*=ProductStatus],select[id*=PaperFormat],select[id*=Unified]').count(),0)
      assert.equal(await page.getByRole('checkbox',{name:/Landscape|Horizontal/}).count(),0,
        'A portrait artwork must exclude the landscape A3 even if it exists in the supplier matrix')
      const keyboardChoice=page.getByRole('checkbox').first()
      await keyboardChoice.press('Space')
      await page.waitForFunction(()=>document.body.textContent.includes('1/12'))
      await page.getByRole('button',{name:es?'Seleccionar combinaciones válidas visibles':'Select valid visible combinations',exact:true}).waitFor({state:'visible'})
      await keyboardChoice.press('Space')
      await page.waitForFunction(()=>document.body.textContent.includes('0/12'))
      await page.getByRole('button',{name:es?'Seleccionar combinaciones válidas visibles':'Select valid visible combinations',exact:true}).click()
      await page.waitForFunction(n=>document.body.textContent.includes(n+'/12'),count)
      assert.equal(candidates.length,count)
      await page.getByRole('button',{name:es?'Limpiar selección de esta presentación':'Clear presentation selection',exact:true}).click()
      await page.waitForFunction(()=>document.body.textContent.includes('0/12'))
      await page.getByRole('button',{name:es?'Seleccionar combinaciones válidas visibles':'Select valid visible combinations',exact:true}).click()
      await page.waitForFunction(n=>document.body.textContent.includes(n+'/12'),count)
      assert.equal(candidates.length,count,'Clear/reselect must reuse candidate identities')
      if(!posters) {
        await page.getByLabel(es?'Columnas':'Columns',{exact:true}).selectOption('')
        await page.getByLabel(es?'Color del marco':'Frame color',{exact:true}).selectOption('black')
        assert.ok(await page.getByText('2/12',{exact:false}).count())
        assert.equal(candidates.length,2,'Filters must retain selected provider identities')
        await page.getByLabel(es?'Color del marco':'Frame color',{exact:true}).selectOption('')
        await page.getByLabel(es?'Columnas':'Columns',{exact:true}).selectOption('frame_color')
      } else {
        omitLast=true
        await page.getByRole('button',{name:es?'Actualizar configuraciones':'Refresh configurations',exact:true}).click()
        await page.getByText(es?'Requiere verificar: configuración cambiada o no disponible.':'Review required: configuration changed or unavailable.',{exact:false}).waitFor()
        assert.equal(await page.getByRole('button',{name:es?'Continuar':'Continue',exact:true}).isDisabled(),true)
        assert.ok(await page.getByText(count+'/12',{exact:false}).count(),'Unavailable selections must not disappear')
        omitLast=false
        await page.getByRole('button',{name:es?'Actualizar configuraciones':'Refresh configurations',exact:true}).click()
        await page.getByText(es?'Requiere verificar: configuración cambiada o no disponible.':'Review required: configuration changed or unavailable.',{exact:false}).waitFor({state:'hidden'})
      }
      await page.getByRole('button',{name:es?'Inspeccionar':'Inspect',exact:true}).first().click()
      await page.getByRole('button',{name:es?'Consultar costo de fabricación':'Request manufacturing cost',exact:true}).click()
      await page.getByText(es?'Solo fabricación; envío e impuestos pendientes.':'Manufacturing only; shipping and tax pending.',{exact:false}).waitFor()
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
      if(process.env.JBU_VISUAL_DIR){await fs.mkdir(process.env.JBU_VISUAL_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.JBU_VISUAL_DIR,`matrix-${mode}-${width}-${lang}.png`),fullPage:true})}
      for(let i=0;i<3;i++)await page.getByRole('button',{name:es?'Continuar':'Continue',exact:true}).click()
      await page.getByRole('button',{name:es?'Crear borrador de producto':'Create product draft',exact:true}).click()
      await page.waitForURL('**/admin/products?**')
      await page.getByRole('heading',{name:es?'Resumen comercial':'Commercial overview',exact:true}).waitFor()

      assert.equal(savedInput.products.length,1)
      assert.equal(savedInput.products[0].variants.length,count)
      assert.equal(await page.getByRole('heading',{name:es?'Vincular obra':'Link artwork',exact:true}).count(),0)
      assert.equal(await page.getByLabel(es?'ID de candidato de Product Studio':'Product Studio candidate ID',{exact:true}).count(),0)
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
      assert.equal(requests.some(row=>/supplierSync|studioDiscover|studioVariants|submitFulfillment/.test(row.operation)),false)
      assert.deepEqual(errors,[])
      if(process.env.JBU_VISUAL_DIR)await page.screenshot({path:path.join(process.env.JBU_VISUAL_DIR,`product-${mode}-${width}-${lang}.png`),fullPage:true})
      await page.close();console.log(`PASS complete matrix, multi-variant draft and Admin handoff ${mode} ${width}px ${lang}`)
    }
  } finally {await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(output,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1})
