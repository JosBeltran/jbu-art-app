/* eslint-disable @typescript-eslint/no-require-imports -- Isolated browser regression harness. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http')
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright'),esbuild=require(process.env.ESBUILD_MODULE || 'esbuild')
const root=path.resolve(__dirname,'..'),art='10000000-0000-4000-8000-000000000001'
;(async()=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'jbu-print-editor-'))
 let browser
 const server=http.createServer(async(req,res)=>{const file=req.url.startsWith('/bundle.css')?'bundle.css':req.url.startsWith('/bundle.js')?'bundle.js':null;res.setHeader('Content-Type',file?.endsWith('.css')?'text/css':file?'text/javascript':'text/html');res.end(file?await fs.readFile(path.join(output,file)):'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"></head><body style="margin:0"><main id="root"></main><script src="/bundle.js"></script></body></html>')})
 try {
  await esbuild.build({absWorkingDir:root,entryPoints:['tests/fixtures/printManager.jsx'],bundle:true,outfile:path.join(output,'bundle.js'),jsx:'automatic',alias:{'@':root},define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},loader:{'.woff':'empty','.woff2':'empty'},plugins:[{name:'editor-fixtures',setup(build){
   build.onResolve({filter:/I18nProvider$/},()=>({path:'locale',namespace:'fixture'}))
   build.onResolve({filter:/authHeaders$/},()=>({path:'auth',namespace:'fixture'}))
   build.onResolve({filter:/supabaseClient$/},()=>({path:'supabase',namespace:'fixture'}))
   build.onResolve({filter:/shipping\/ShippingProvider$/},()=>({path:'shipping',namespace:'fixture'}))
   build.onResolve({filter:/(PrintAssetGenerator|PrintProductionPanel|ArtworkPrintMasterUpload|PrintGalleryEditor|ImageUploader)$/},args=>({path:args.path.split('/').at(-1),namespace:'fixture'}))
   build.onLoad({filter:/.*/,namespace:'fixture'},({path:name})=>({loader:'jsx',contents:
    name==='locale'?"const t=(es)=>es;export const useI18n=()=>({t,locale:'es',lang:'es'});export const localized=(row,field)=>row?.[field];export const useLocalized=()=>row=>row":
    name==='auth'?"export const authHeaders=async()=>({Authorization:'Bearer fixture-admin'})":
    name==='shipping'?"const config={globalCountries:['MX','US'],defaults:{open_print:['policy']},policies:[{id:'policy',name:'Incluido',active:true}]};export const useShipping=()=>config":
    name==='supabase'?"export const supabase={from(){return {select(){return this},eq(){return this},single:async()=>({data:{shipping_policy_ids:null}})}}}":
    name==='PrintProductionPanel'?"export const printProductionLabel=()=> 'Maestro pendiente';export default function Panel(){return <div data-testid='production'>Validacion</div>}":
    `export default function Panel(){return <div data-testid='${name}'>${name}</div>}`
   }))
  }}]})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']})
  for(const width of [1366,390]) {
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[],requests=[]
   page.on('pageerror',error=>errors.push(error.message))
   const artwork={id:art,title:'Multiverse Signal · version anterior · version anterior',sku:'MULTI',allows_prints:true}
   const variants=['A1','A2','A3'].map((size,index)=>({id:'20000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),artwork_id:art,size,size_code:size,title:'Presentacion '+size,finish:'FINE_ART',orientation:'portrait',border_unit:'percent',border_value:5,edition_type:'OPEN',price:null,is_active:false,currency:'MXN',sort_order:0}))
   await page.route('**/api/admin/prints**',async route=>{
    const req=route.request(),url=new URL(req.url());requests.push({method:req.method(),path:url.pathname+url.search,body:req.method()==='GET'?null:req.postDataJSON()})
    if(req.method()==='PATCH'){const input=req.postDataJSON();variants.find(row=>row.id===input.id).is_active=input.is_active;return route.fulfill({json:{id:input.id,is_active:input.is_active}})}
    if(req.method()==='POST'){const input=req.postDataJSON();Object.assign(variants.find(row=>row.id===input.id),input);return route.fulfill({json:{variant:input}})}
    return route.fulfill({json:url.searchParams.has('artwork')?{gallery:[],provenance:[]}:{artworks:[artwork],variants}})
   })
   await page.goto('http://127.0.0.1:'+server.address().port)
   await page.getByRole('button',{name:'Editar',exact:true}).first().click()
   assert.equal(await page.locator('form').count(),1)
   assert.equal(await page.locator('ul[class*=list]').count(),0,'The list is not mounted in the editor')
   assert.equal(await page.getByTestId('ArtworkPrintMasterUpload').count(),0)
   assert.equal(await page.getByTestId('PrintGalleryEditor').count(),0)
   const title=page.getByLabel('Titulo comercial (ES)',{exact:true}).or(page.locator('#print-title'))
   await title.fill('Texto estable')
   await title.press('End');await title.pressSequentially(' al escribir',{delay:15})
   assert.equal(await title.inputValue(),'Texto estable al escribir')
   assert.equal(await title.evaluate(node=>document.activeElement===node),true,'Typing preserves focus')
   await page.getByRole('tab',{name:'Preview y maestro',exact:true}).click()
   assert.equal(await page.locator('form').count(),0)
   assert.equal(await page.getByTestId('ArtworkPrintMasterUpload').count(),1)
   assert.equal(await page.getByTestId('PrintGalleryEditor').count(),0)
   await page.getByRole('tab',{name:'Datos',exact:true}).click()
   assert.equal(await page.locator('#print-title').inputValue(),'Texto estable al escribir','The unsaved draft survives tab changes')
   await page.getByRole('button',{name:'Guardar y cerrar',exact:true}).click()
   await page.getByRole('button',{name:'Activar',exact:true}).first().click()
   await page.getByRole('button',{name:'Desactivar',exact:true}).first().waitFor()
   assert.equal(await page.locator('form').count(),0,'Activation does not open an editor')
   assert.ok(requests.some(row=>row.method==='PATCH' && row.body.is_active===true))
   assert.ok(requests.filter(row=>row.method==='GET' && row.path.includes('?artwork=')).length<=2,'Typing does not repeatedly reload form data')
   assert.equal(await page.locator('li [class*=row]').first().evaluate(node=>getComputedStyle(node).display),'grid')
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow')
   assert.deepEqual(errors,[])
   await page.close();console.log('PASS focused Artwork Print editing, stable typing, tabs and activation '+width+'px')
  }
 } finally {await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(output,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1})
