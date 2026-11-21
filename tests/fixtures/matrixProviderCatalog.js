// Explicit contract simulation: three source configurations, two nonterminal
// short pages plus an empty terminal probe. These are not live Gelato results.
import {observedPostersFetch,simulatedPosters} from './gelatoPostersObserved.js'
export const matrixProducts=[simulatedPosters[0],simulatedPosters[1],
  {...simulatedPosters[0],productUid:'poster-matrix-fixture-A4',attributes:{...simulatedPosters[0].attributes,PaperFormat:'A4'},dimensions:{Width:{value:210,measureUnit:'mm'},Height:{value:297,measureUnit:'mm'}}}]
export function matrixProviderFetch({calls=[]}={}) {
  const fetcher=observedPostersFetch({products:matrixProducts,calls})
  return async(url,options)=>{
    if(url.endsWith('/catalogs/posters')) {
      const data=await (await fetcher(url,options)).json()
      data.productAttributes.find(row=>row.productAttributeUid==='PaperFormat').values.push({productAttributeValueUid:'A4',title:'A4'})
      return Response.json(data)
    }
    if(url.endsWith('/products:search')) {
      const response=await fetcher(url,options)
      const result=await response.json()
      return Response.json({...result,products:result.products.slice(0,2)})
    }
    return fetcher(url,options)
  }
}
