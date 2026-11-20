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
const revision='10000000-0000-4000-8000-000000000003'
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#356875"/></svg>')
const groups=Array.from({length:13},(_,i)=>({id:'gelato:poster:'+i,group:'poster',provider:'gelato',externalId:'gelato:poster:'+i,revision,
  variants:[],titles:['Póster · algodón '+(i+1),'Poster · cotton '+(i+1)],variantCount:2,
  metadata:{titles:['Póster · algodón '+(i+1),'Poster · cotton '+(i+1)],descriptions:['Papel: algodón','Paper: cotton'],
    specifications:{paper:'cotton'},sourceCatalog:'posters',sizes:['30x40-cm','50x70-cm'],finishes:['matte'],images:[],image:null}}))
const variants=[{externalId:'poster-a',externalVariantId:'poster-a',sku:'EXACT-A',attributes:{size:'30x40-cm',paper:'cotton',finish:'matte'},widthMm:300,heightMm:400,countries:['MX']},
  {externalId:'poster-b',externalVariantId:'poster-b',sku:'EXACT-B',attributes:{size:'50x70-cm',paper:'cotton',finish:'matte'},widthMm:500,heightMm:700,countries:['MX']}]

;(async()=>{
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
      page.on('pageerror',error=>errors.push(error.message))
      await page.route('**/api/admin/product-catalog',async route=>{
        const {operation,input}=route.request().postDataJSON()
        requests.push({operation,input})
        let data
        switch(operation) {
          case 'listSessions':data=[];break
          case 'artworkSearch':data=[{id:art,title:'Mar',title_en:'Sea',sku:'MAR',primary_image_url:image}];break
          case 'artworkAssets':data={artwork:{id:art,title:'Mar',title_en:'Sea',sku:'MAR',primary_image_url:image},assets:[]};break
          case 'createSession':data={id:session,artwork_id:art,criteria:input};break
          case 'list':data={books:[]};break
          case 'supplierSyncStatus':data=[{provider_code:'gelato',active_revision:revision,last_success_at:'2026-11-20T12:00:00Z',active:{stats:{groups:13,variants:26}},run:{status:'complete',created_at:'2026-11-20T11:59:00Z',completed_at:'2026-11-20T12:00:00Z',pages:4,errors:0}}];break
          case 'studioDiscover':{
            const filtered=groups.filter(group=>!input.query || group.metadata.titles.join(' ').includes(input.query))
            data={groups:filtered.slice(input.offset,input.offset+12),total:filtered.length};break
          }
          case 'studioVariants':data={variants,nextOffset:null,revision};break
          case 'supplierSyncStart':data={id:revision};break
          case 'supplierSyncAdvance':data={revision,complete:true};break
          case 'addCandidate':data={id:'10000000-0000-4000-8000-000000000004'};break
          default:throw new Error('Unexpected API operation '+operation)
        }
        await route.fulfill({json:data})
      })
      const es=lang==='es'
      await page.goto(`http://127.0.0.1:${server.address().port}/?lang=${lang}&theme=${theme}`)
      await page.getByLabel(es?'Título de la obra':'Artwork title',{exact:true}).fill('Mar')
      await page.getByRole('button',{name:es?'Buscar obras':'Find artworks',exact:true}).click()
      await page.getByRole('button',{name:/Sea|Mar/}).click()
      await page.getByRole('button',{name:es?'Elegir productos':'Choose products',exact:true}).click()
      await page.getByText(groups[0].metadata.titles[es?0:1],{exact:true}).waitFor()
      assert.equal(await page.getByRole('button',{name:es?'Configurar producto':'Configure product',exact:true}).count(),12)
      assert.equal(await page.getByText(es?'Fotografía del proveedor no disponible':'Supplier photograph unavailable',{exact:true}).count(),12)
      assert.equal(requests.some(row=>['categories','searchCatalog','inspectProduct','supplierSyncAdvance'].includes(row.operation)),false)
      await page.getByRole('button',{name:es?'Página siguiente':'Next page',exact:true}).click()
      await page.getByText(groups[12].metadata.titles[es?0:1],{exact:true}).waitFor()
      assert.equal(requests.filter(row=>row.operation==='studioDiscover').at(-1).input.offset,12)
      await page.getByLabel(es?'Buscar producto o especificación':'Search products or specifications',{exact:true}).fill(es?'algodón 13':'cotton 13')
      await page.getByText(groups[12].metadata.titles[es?0:1],{exact:true}).waitFor()
      await page.waitForTimeout(400)
      assert.equal(requests.filter(row=>row.operation==='studioDiscover').at(-1).input.offset,0)
      await page.getByRole('button',{name:es?'Configurar producto':'Configure product',exact:true}).click()
      const size=page.getByLabel(es?'Tamaño':'Size',{exact:true})
      await size.waitFor()
      await size.selectOption('50x70-cm')
      await page.getByRole('button',{name:es?'Agregar configuración':'Add configuration',exact:true}).click()
      const selection=requests.find(row=>row.operation==='addCandidate')
      assert.equal(selection.input.variantId,'poster-b')
      assert.equal(selection.input.revision,revision)
      assert.equal(selection.input.groupKey,groups[12].id)
      await page.getByRole('button',{name:es?'Atrás':'Back',exact:true}).click()
      assert.equal(await page.getByLabel(es?'Buscar producto o especificación':'Search products or specifications',{exact:true}).inputValue(),es?'algodón 13':'cotton 13')
      assert.equal(requests.filter(row=>row.operation==='studioVariants').length,1)
      await page.getByText(es?'Administrar sincronización del catálogo':'Manage catalog synchronization',{exact:true}).click()
      await page.getByRole('button',{name:es?'Sincronizar catálogo':'Synchronize catalog',exact:true}).click()
      await page.waitForTimeout(400)
      assert.equal(requests.filter(row=>row.operation==='supplierSyncStart').length,1)
      assert.equal(requests.filter(row=>row.operation==='supplierSyncAdvance').length,1)
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
      assert.deepEqual(errors,[])
      if(process.env.JBU_VISUAL_DIR){await fs.mkdir(process.env.JBU_VISUAL_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.JBU_VISUAL_DIR,`catalog-${width}-${lang}-${theme}.png`),fullPage:true})}
      await page.close()
      console.log(`PASS catalog/configuration ${width}px ${lang} ${theme}`)
    }
  } finally {
    await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(output,{recursive:true,force:true})
  }
})().catch(error=>{console.error(error);process.exitCode=1})
