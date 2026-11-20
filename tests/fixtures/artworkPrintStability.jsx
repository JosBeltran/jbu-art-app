import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Theme } from '@carbon/react'
import UnifiedStudio from '../../app/admin/product-studio/UnifiedStudio'
import { AppThemeProvider, useAppTheme } from '../../components/AppThemeProvider'
import ArtworkDetailClient from '../../app/artwork/[sku]/ArtworkDetailClient'
import { useCatalogReads } from '../../components/admin/productCatalog/useCatalog'
import { studioGroup, mergeStudioGroups } from '../../lib/productCatalog/studioDiscovery'
import Products from '../../app/admin/products/page'

const art={id:'art',sku:'ART-1',title:'La memoria del agua',title_en:'La memoria del agua',primary_image_url:'/art.svg'}
const session={id:'session',artwork_id:art.id,state:'active',criteria:{providers:['gelato','prodigi'],countries:['MX']}}
const books=[{id:'mx',name:'Mexico',country:'MX',currency:'MXN',status:'active'},{id:'us',name:'USA',country:'US',currency:'USD',status:'active'}]
const variant=(i=0)=>({externalVariantId:'variant-'+i,externalId:'product-'+i,sku:'SKU-'+i,widthMm:210,heightMm:297,
  attributes:{size:i%2?'A3':'A4',paper:'matte',orientation:'portrait'},configuration:{sku:'variant-'+i},countries:['MX','US']})
const sampleGroups=Array.from({length:120},(_,i)=>({id:'gelato:fine_art_print:'+i,name:'Paper '+i,group:'fine_art_print',provider:'gelato',externalId:'product-'+i,
  categoryLabel:['Impresión artística','Fine Art Print'],description:'Museum paper',variants:Array.from({length:8},(_,j)=>variant(i*8+j))}))
const groupingIds=['300x400-mm-12x16-inch_black','500x700-mm-20x28-inch_black','500x700-mm-20x28-inch_natural'].map(value=>{
 const [size,color]=value.split('_')
 return `frame_and_poster_product_frs_${size}_frc_${color}_frm_wood_pt_matte_ver`
})
const grouped=mergeStudioGroups([],groupingIds.map(externalId=>studioGroup('gelato',{externalId,category:'framed-posters',title:externalId,
 supportedCountries:['MX'],variants:[{externalVariantId:externalId,sku:externalId,attributes:{PaperType:'matte'}}]})))[0]
const groups=window.fixtureGrouping ? [{...grouped,variants:grouped.variants.slice(0,1)}] : sampleGroups
const fixture=window.fixture={requests:[],parentRenders:0,matches:0,pending:[],lang:window.fixtureLang||'en',groups,session,art,books,errors:[],cart:[],country:'MX',user:window.fixtureUser?{id:'collector',email:'fixture@example.test'}:null}
window.addEventListener('error',e=>{if(e.message)fixture.errors.push(e.message)})
fixture.release=(operation,value)=>{const entry=fixture.pending.find(row=>row.operation===operation);fixture.pending=fixture.pending.filter(row=>row!==entry);entry?.resolve(value)}
window.fetch=async(url,options={})=>{
  if(url==='/api/checkout/points'){fixture.boost=JSON.parse(options.body);return {ok:false,json:async()=>({error:'fixture'})}}
  if(url.startsWith('/api/checkout/physical-edition/status'))return {ok:true,json:async()=>({purchases:[]})}
  if(url.startsWith('/api/artwork-comments'))return {ok:true,json:async()=>({comments:[],count:0})}
  if(url!=='/api/admin/product-catalog')throw new Error('Unexpected fixture URL '+url)
  const {operation,input}=JSON.parse(options.body)
  if(options.signal?.aborted)throw new DOMException('Aborted','AbortError')
  const record={operation,input,aborted:false};fixture.requests.push(record)
  let value
  if(operation==='listSessions')value=[{...session,artworks:art}]
  if(operation==='artworkSearch')value=[art]
  if(operation==='artworkAssets')value={artwork:art,assets:[]}
  if(operation==='createSession')value=session
  if(operation==='resumeSession')value={session,candidates:[]}
  if(operation==='list')value={books,families:[{code:'fine_art_print',label_es:'Impresión artística',label_en:'Fine Art Print'}],products:[],attributes:[]}
  if(operation==='studioDiscover')value={groups:input.provider==='prodigi'?[{...groups[0],id:'prodigi:fine_art_print:one',provider:'prodigi',variants:[]}]:groups,issues:[],hasMore:false,partial:false}
  if(operation==='studioVariants'){
    const offset=input.cursor?.offset || 0
    value=window.fixtureGrouping ? {variants:[grouped.variants[offset<4?0:offset===4?1:2]],state:offset<5?'partial':'complete',hasMore:offset<5,cursor:{catalog:0,offset:offset+1,done:offset===5}} : {variants:[variant()],nextOffset:null,state:'complete',hasMore:false}
  }
  if(operation==='studioVariantCost')value={manufacturingMinor:2500}
  if(operation==='addCandidate'){
    value={id:input.provider+'-candidate-'+fixture.requests.filter(row=>row.operation==='addCandidate').length}
    const candidates=JSON.parse(localStorage.getItem('fixture.candidates')||'[]');candidates.push({...input,...value});localStorage.setItem('fixture.candidates',JSON.stringify(candidates))
  }
  if(operation==='wallArtCosts')value=input.candidateIds.map(candidateId=>({candidateId,manufacturingMinor:2500}))
  if(operation==='saveWallArtDrafts'){fixture.saved=input;localStorage.setItem('fixture.saved',JSON.stringify(input));value=['saved-product']}
  if(operation==='productDetails'){
    const saved=JSON.parse(localStorage.getItem('fixture.saved')||'null')?.products?.[0]
    value={product:{id:'saved-product',sku:'PRODUCT-1',family_code:'fine_art_print',status:'draft',title_es:saved?.titleEs||'Saved title',title_en:saved?.titleEn||'',description_es:saved?.descriptionEs||'',description_en:saved?.descriptionEn||''},artworks:[{artworks:art}],variants:window.fixtureGrouping ? (saved?.variants||[]).map((item,index)=>{
      const candidate=JSON.parse(localStorage.getItem('fixture.candidates')).find(row=>row.id===item.candidateId)
      const config=grouped.variants.find(row=>row.externalVariantId===candidate.variantId)
      return {id:'saved-variant-'+index,sku:config.sku,title:config.attributes.size,fulfillment_type:'provider',inventory_policy:'made_to_order',status:'draft',
        product_variant_attribute_values:Object.entries(config.attributes).map(([attribute_code,text_value])=>({attribute_code,text_value})),
        provider_product_mappings:[{id:'mapping-'+index,provider_code:'gelato',external_variant_id:config.externalVariantId,validation_status:'pending',enabled:false}],
        price_book_entries:[],product_variant_assets:[]}
    }) : [],media:[],attributes:[]}
  }
  if(operation==='editProduct'){fixture.edited=input;const data=JSON.parse(localStorage.getItem('fixture.saved'));Object.assign(data.products[0],input);localStorage.setItem('fixture.saved',JSON.stringify(data));value={}}
  if(fixture.defer===operation){
    value=await new Promise((resolve,reject)=>{
      fixture.pending.push({operation,resolve:result=>resolve(result??value)})
      options.signal?.addEventListener('abort',()=>{record.aborted=true;reject(new DOMException('Aborted','AbortError'))},{once:true})
    })
  }
  if(fixture.fail===operation)return {ok:false,json:async()=>({error:'provider_unreachable'})}
  return {ok:true,json:async()=>value}
}
fixture.related=Array.from({length:window.fixtureRelatedCount??4},(_,i)=>({...art,id:'related-'+i,sku:'RELATED-'+i,title:'Obra relacionada '+i,title_en:'Related artwork '+i,status:'AVAILABLE',availability_status:'AVAILABLE'}))
fixture.detailArt={...art,title:'La memoria del agua — Long Original Artist Title',title_en:'La memoria del agua — Long Original Artist Title',
  status:'AVAILABLE',availability_status:'AVAILABLE',ownership_status:'AVAILABLE',base_price_mxn:5000,price_display_mode:'SHOW_PRICE',
  series:'Tides',year:2026,dimensions:'80 × 60 cm',medium:'Resina sobre madera',medium_en:'Resin on wood',
  description:'Descripción de la obra en español.',description_en:'English artwork description.\n\nSecond curatorial paragraph.',
  secondary_images:['/art-2.svg'],effective_shipping_countries:['MX','US'],allowed_shipping_countries:['MX','US'],physical_edition_type:window.fixtureEdition?'LIMITED_EDITION':'UNIQUE',
  physical_edition_size:20,physical_edition_sales_enabled:true,
  provenance_events:[{id:'event',event_type:'CREATED',event_date:'2026',title:'Historical artist-authored title',description:'Original historical record.',created_at:'2026-01-01',images:[]}],
  version_family:window.fixtureVersions || [{id:'prior',sku:'PRIOR',title:'Etapa anterior',title_en:'Earlier stage',year:2020,is_historical_version:true,primary_image_url:'/art.svg'}]}
fixture.db=table=>{
  fixture.dbReads=(fixture.dbReads||[]).concat(table)
  const data=table==='series'?[{title:'Tides',title_en:'Tides',title_es:'Mareas'}]:table==='artwork_images'?[]:[]
  const q={select(){return q},eq(){return q},ilike(){return q},limit(){return q},order(){return q},in(){return q},maybeSingle:async()=>({data:null}),then(resolve,reject){return Promise.resolve({data,error:null}).then(resolve,reject)}};return q
}
function View(){
  const {dark}=useAppTheme()
  const reads=useCatalogReads()
  useEffect(()=>{fixture.reads=reads},[reads])

  const [,render]=useState(0)
  useEffect(()=>{
    fixture.language=lang=>{fixture.lang=lang;render(n=>n+1)}
    fixture.market=country=>{fixture.country=country;render(n=>n+1)}
  },[])
  const params=new URLSearchParams(location.search)
  return <Theme theme={dark?'g100':'g10'}>
    <div style={{maxWidth:1440,margin:'auto',padding:'1rem'}}>
      {params.get('screen')==='detail'?<ArtworkDetailClient printCountries={window.fixturePrintCountries} artwork={fixture.detailArt} commentsEnabled/>:params.get('screen')==='manager'?<Products/>:<UnifiedStudio/>}
    </div>
  </Theme>
}
function App(){return <AppThemeProvider initialDark={window.fixtureDark}><View/></AppThemeProvider>}
createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>)
