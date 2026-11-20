import test from 'node:test'
import assert from 'node:assert/strict'
import { gelatoAdapter } from './providers.js'
import { studioGroup, studioVariantKey, matchingStudioVariants } from './studioDiscovery.js'
import { studioGroupConfigurations } from './studioDiscovery.server.js'

// Synthetic API contract fixtures, not a claim of live Gelato verification.
const uid=(size,color)=>`frame_and_poster_product_frs_${size}_frc_${color}_frm_wood_pt_matte_ver`
const a=uid('300x400-mm-12x16-inch','black'),b=uid('500x700-mm-20x28-inch','black'),c=uid('500x700-mm-20x28-inch','natural')
const row=id=>({productUid:id,supportedCountries:['MX'],attributes:{PaperType:'matte'}})
function provider({fail=false,single=false}={}){
 const calls=[]
 const fetcher=async(url,init)=>{
  calls.push({url,body:init.body?JSON.parse(init.body):null})
  if(url.endsWith('/catalogs'))return Response.json({catalogs:[{catalogUid:'framed-posters',title:'Framed Posters'}]})
  if(url.includes('/products:search')){
   const {offset}=JSON.parse(init.body)
   if(fail && offset===25)return new Response('',{status:429,headers:{'retry-after':'5'}})
   const products=offset===0?(single?[row(a)]:Array.from({length:25},()=>row(a))):[row(b),row(c)]
   return Response.json({products})
  }
  const id=decodeURIComponent(url.split('/').pop())
  return Response.json(row(id))
 }
 return {adapter:()=>gelatoAdapter('fixture',fetcher),calls}
}

test('synthetic Gelato API pages form one family and preserve exact supplied size/frame UIDs',async()=>{
 const {adapter,calls}=provider()
 const first=await studioGroupConfigurations(adapter,{provider:'gelato',externalId:a,category:'framed-posters',country:'MX',refresh:true})
 assert.equal(first.state,'partial');assert.equal(first.hasMore,true)
 const next=await studioGroupConfigurations(adapter,{provider:'gelato',externalId:a,category:'framed-posters',cursor:first.cursor,country:'MX',refresh:true})
 assert.equal(next.state,'complete');assert.equal(next.hasMore,false)
 const variants=new Map([...first.variants,...next.variants].map(row=>[studioVariantKey(row),row]))
 assert.equal(variants.size,3)
 assert.equal(new Set([...variants.values()].map(row=>studioGroup('gelato',{externalId:row.externalId,variants:[row]}).id)).size,1)
 assert.equal(matchingStudioVariants([...variants.values()],{size:'500x700-mm-20x28-inch',frame_color:'natural'})[0].externalVariantId,c)
 assert.equal(matchingStudioVariants([...variants.values()],{size:'300x400-mm-12x16-inch',frame_color:'natural'}).length,0)
 assert.equal(calls.filter(call=>call.body).length,2,'bounded progressive search')
})

test('a genuine one-size product is complete only after catalogue exhaustion',async()=>{
 const {adapter}=provider({single:true})
 const page=await studioGroupConfigurations(adapter,{provider:'gelato',externalId:a,category:'framed-posters',country:'MX',refresh:true})
 assert.equal(page.state,'complete');assert.equal(page.variants.length,1)
})

test('rate-limit failures retain an actionable cursor and never mark configurations complete',async()=>{
 const {adapter,calls}=provider({fail:true})
 const first=await studioGroupConfigurations(adapter,{provider:'gelato',externalId:a,category:'framed-posters',country:'MX',refresh:true})
 const failed=await studioGroupConfigurations(adapter,{provider:'gelato',externalId:a,cursor:first.cursor,country:'MX',refresh:true})
 assert.equal(failed.state,'failed');assert.equal(failed.hasMore,true)
 assert.equal(failed.cursor.offset,25)
 assert.equal(failed.issues[0].code,'provider_rate_limited')
 const before=calls.length
 await assert.rejects(studioGroupConfigurations(adapter,{provider:'gelato',externalId:a,cursor:first.cursor,country:'MX',refresh:true}),{code:'provider_rate_limited'})
 assert.equal(calls.length,before,'Retry-After prevents additional supplier requests')
})
