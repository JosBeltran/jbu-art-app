import assert from 'node:assert/strict'
import test from 'node:test'
import {registerHooks} from 'node:module'

const stub = `
  const values = new Map()
  export function unstable_cache(read, keys, options) {
    if (options.revalidate !== 86400 || options.tags[0] !== 'public-print-detail')
      throw new Error('Unexpected print cache policy')
    return async (...args) => {
      const key = JSON.stringify([keys,args])
      if (!values.has(key)) values.set(key,await read(...args))
      return values.get(key)
    }
  }
  export function revalidateTag(tag, profile) {
    if (tag !== 'public-print-detail' || profile.expire !== 0)
      throw new Error('Print data must expire immediately')
    values.clear()
  }
`
const hook=registerHooks({resolve(id,context,next) {
  if (id==='next/cache' || id==='server-only') return {
    url:'data:text/javascript,'+encodeURIComponent(id==='next/cache' ? stub : 'export {}'),shortCircuit:true,
  }
  return next(id,context)
}})
const {cachePrintDetail,invalidatePrintCatalogWrite}=await import('./printDetailCache.server.js')
hook.deregister()

test('print cache reuses per-work reads and expires after successful market and price edits',async()=>{
  let calls=0
  const read=cachePrintDetail('commercial',async sku=>({sku,count:++calls}))
  assert.deepEqual(await read('one'),{sku:'one',count:1})
  assert.deepEqual(await read('two'),{sku:'two',count:2})
  invalidatePrintCatalogWrite('quoteStudioMarket',[])
  invalidatePrintCatalogWrite('enableStudioMarket',[{error:'quote_expired'}])
  assert.deepEqual(await read('one'),{sku:'one',count:1})
  invalidatePrintCatalogWrite('enableStudioMarket',[{error:'quote_expired'},{priceEntryId:'entry'}])
  assert.deepEqual(await read('one'),{sku:'one',count:3})
  invalidatePrintCatalogWrite('approvePrice',{approved:true})
  assert.deepEqual(await read('one'),{sku:'one',count:4})
})

test('a partial read error does not become a cached empty catalog',async()=>{
  let calls=0
  const read=cachePrintDetail('partial',async()=>{
    if (++calls===1) throw new Error('partial result')
    return ['ready']
  })
  await assert.rejects(read(),/partial result/)
  assert.deepEqual(await read(),['ready'])
  assert.deepEqual(await read(),['ready'])
  assert.equal(calls,2)
})
