// Documented API shapes + provider UIDs from the user's audit. All responses are fixtures, not live acceptance.
export const nativeCatalog={catalogUid:'framed-posters',title:'Framed posters',productAttributes:[
  {productAttributeUid:'PaperFormat',title:'Paper format',values:[{productAttributeValueUid:'A2',title:'A2'},{productAttributeValueUid:'A3',title:'A3'}]},
  {productAttributeUid:'FrameColor',title:'Frame color',values:[{productAttributeValueUid:'black',title:'Black'},{productAttributeValueUid:'natural-wood',title:'Natural wood'}]},
  {productAttributeUid:'PaperType',title:'Paper type',values:[{productAttributeValueUid:'200-gsm-80lb-uncoated',title:'200 gsm uncoated'}]},
]}
export const nativeProducts=[
  {productUid:'framed_poster_a2_black_wood_w12xt22-mm_plexiglass_a2_200-gsm-80lb-uncoated_4-0_ver',
    attributes:{PaperFormat:'A2',FrameColor:'black',PaperType:'200-gsm-80lb-uncoated',Orientation:'ver',FrameMaterial:'wood'},
    dimensions:{Width:{value:420,measureUnit:'mm'},Height:{value:594,measureUnit:'mm'}},supportedCountries:['MX','US'],isPrintable:true},
  {productUid:'framed_poster_a3_natural-wood_wood_w12xt22-mm_plexiglass_a3_200-gsm-80lb-uncoated_4-0_ver',
    attributes:{PaperFormat:'A3',FrameColor:'natural-wood',PaperType:'200-gsm-80lb-uncoated',Orientation:'ver',FrameMaterial:'wood'},
    dimensions:{Width:{value:297,measureUnit:'mm'},Height:{value:420,measureUnit:'mm'}},supportedCountries:['MX','US'],isPrintable:true},
]
export function nativeGelatoFetch({calls=[],failDefinition=false,failAll=false,products=nativeProducts}={}) {
  return async(url,options)=>{
    calls.push({url,body:options.body ? JSON.parse(options.body) : null})
    if(failAll || failDefinition && url.endsWith('/catalogs/framed-posters'))return new Response(null,{status:429,headers:{'Retry-After':'30'}})
    if(url.endsWith('/catalogs'))return Response.json([{catalogUid:'framed-posters',title:'Framed posters'},{catalogUid:'cards',title:'Cards'}])
    if(url.endsWith('/catalogs/framed-posters'))return Response.json(nativeCatalog)
    if(url.endsWith('/products:search')) {
      const body=JSON.parse(options.body)
      const matching=products.filter(row=>Object.entries(body.attributeFilters || {}).every(([key,values])=>values.includes(row.attributes[key])))
      const hits=Object.fromEntries(nativeCatalog.productAttributes.map(attr=>[attr.productAttributeUid,
        Object.fromEntries(attr.values.map(value=>[value.productAttributeValueUid,matching.filter(row=>row.attributes[attr.productAttributeUid]===value.productAttributeValueUid).length]))]))
      return Response.json({products:matching.slice(body.offset,body.offset+body.limit),hits:{attributeHits:hits}})
    }
    const uid=decodeURIComponent(url.split('/products/')[1] || '')
    const row=products.find(row=>row.productUid===uid)
    return row ? Response.json(row) : new Response(null,{status:404})
  }
}
