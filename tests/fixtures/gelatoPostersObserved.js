// Excerpt of the real normalized Admin response supplied 2026-11-20.
// Keep all 14 attribute identifiers and all paper types. Long size/country arrays
// are trimmed to observed entries; no positive poster product is fabricated here.
const options=values=>values.map(id=>({id,title:id}))
const attribute=(id,values)=>({id,title:id,values:options(values)})
export const observedPostersResponse={
  schema:{id:'posters',title:'Posters',family:'poster',attributes:[
    attribute('State',['published']),
    {id:'UnifiedPaperFormat',title:'UnifiedPaperFormat',values:[{id:'500x700-mm-20x28-inch',title:'50x70cm / 20x28"'},{id:'A2',title:'A2 (42 x 59.4 cm)'}]},
    {id:'PaperFormat',title:'PaperFormat',values:[{id:'210x279-mm',title:'Mid Atlantic'},{id:'500x700-mm',title:'50 x 70 cm'},{id:'A2',title:'A2 (42 x 59.4 cm)'},{id:'A3',title:'A3 (29.7 x 42 cm)'}]},
    {id:'Variable',title:'Variable',values:[{id:'no',title:'Variable is disabled'},{id:'yes',title:'Variable is enabled'}]},
    attribute('ShapeEdgeType',['none','round-8mm']),
    {id:'UnifiedPaperType',title:'UnifiedPaperType',values:[
      {id:'200-gsm-80lb-uncoated',title:'200 gsm / 80 lb cover uncoated'},
      {id:'250-gsm-100lb-uncoated-offwhite-archival',title:'250 gsm / 100 lb cover uncoated off white archival'},
      {id:'170-gsm-65lb-coated-silk',title:'170 gsm / 65 lb cover coated silk'},
      {id:'170-gsm-65lb-uncoated',title:'170 gsm / 65 lb cover uncoated'},
      {id:'200-gsm-80lb-coated-silk',title:'200 gsm / 80 lb cover coated silk'},
    ]},
    attribute('SpotFinishingType',['foil-gold-1-1','foil-silver-1-0','foil-silver-1-1','none','foil-copper-1-0','foil-copper-1-1','foil-gold-1-0']),
    {id:'CoatingType',title:'CoatingType',values:[{id:'none',title:'No coating'}]},
    attribute('PaperType',['250-gsm-coated-silk','350-gsm-uncoated','65-lb-cover-coated-silk','115-gsm-coated-silk','300-gsm-coated-silk','100-lb-cover-uncoated-offwhite-archival','250-gsm-uncoated','200-gsm-coated-silk','80-lb-text-coated-silk','300-gsm-uncoated','65-lb-cover-uncoated','100-lb-text-coated-silk','110-lb-cover-uncoated','150-gsm-coated-silk','60-lb-text-uncoated','250-gsm-uncoated-offwhite-archival','110-lb-cover-coated-silk','115-gsm-uncoated','90-gsm-uncoated','80-lb-cover-coated-silk','170-gsm-coated-silk','200-gsm-uncoated','80-lb-text-uncoated','170-gsm-uncoated','350-gsm-coated-silk','100-lb-cover-uncoated','130-lb-cover-coated-silk','80-lb-cover-uncoated','100-lb-text-uncoated','150-gsm-uncoated','100-lb-cover-coated-silk','130-lb-cover-uncoated']),
    {id:'Orientation',title:'Orientation',values:[{id:'hor',title:'Horizontal (landscape) orientation'},{id:'ver',title:'Vertical (portrait) orientation'}]},
    {id:'ProtectionType',title:'ProtectionType',values:[{id:'none',title:'No protection'}]},
    attribute('ProductModel',['flat_product','flat_geo_simplified']),
    attribute('ProductStatus',['activated']),attribute('ColorType',['4-0']),
  ],cache:{stale:false,fetchedAt:'2026-11-20T19:39:23.698Z',expiresAt:'2026-11-21T19:39:23.698Z',version:'492186d662908f26ab31d080410e8b1689a6f87adcd1eb394ee45241843c1095'}},
  candidates:[
    ['cards_pf_210x279-mm_pt_250-gsm-coated-silk_cl_4-0_hor','250-gsm-coated-silk','hor'],
    ['cards_pf_210x279-mm_pt_250-gsm-coated-silk_cl_4-0_ver','250-gsm-coated-silk','ver'],
    ['cards_pf_210x279-mm_pt_250-gsm-uncoated_cl_4-0_hor','250-gsm-uncoated','hor'],
    ['cards_pf_210x279-mm_pt_250-gsm-uncoated_cl_4-0_ver','250-gsm-uncoated','ver'],
    ['cards_pf_210x279-mm_pt_300-gsm-uncoated_cl_4-0_hor','300-gsm-uncoated','hor'],
    ['cards_pf_210x279-mm_pt_300-gsm-uncoated_cl_4-0_ver','300-gsm-uncoated','ver'],
    ['cards_pf_210x279-mm_pt_350-gsm-coated-silk_cl_4-0_hor','350-gsm-coated-silk','hor'],
    ['cards_pf_210x279-mm_pt_350-gsm-coated-silk_cl_4-0_ver','350-gsm-coated-silk','ver'],
  ].map(([uid,paper,orientation])=>({externalId:uid,externalVariantId:uid,sku:uid,title:uid,configuration:{},
    sourceAttributes:{CoatingType:'none',ColorType:'4-0',Orientation:orientation,PaperFormat:'210x279-mm',PaperType:paper,ProductStatus:'activated',ProtectionType:'none',ShapeEdgeType:'none',SpotFinishingType:'none',State:'published',Variable:'no'},
    countries:['MX'],widthMm:orientation==='hor'?279:210,heightMm:orientation==='hor'?210:279})),
  nextOffset:25,optionsScope:'filtered_catalog',availability:'supplier_reported_or_unknown',
}

// Explicitly simulated positive contract data; these are not observed Gelato responses.
export const simulatedPosters=[
  {productUid:'poster-contract-fixture-A2-uncoated',attributes:{PaperType:'200-gsm-uncoated',PaperFormat:'A2',Orientation:'ver',State:'published',ProductStatus:'activated',Variable:'no',CoatingType:'none'},dimensions:{Width:{value:420,measureUnit:'mm'},Height:{value:594,measureUnit:'mm'}},supportedCountries:['MX']},
  {productUid:'poster-contract-fixture-A3-uncoated',attributes:{PaperType:'200-gsm-uncoated',PaperFormat:'A3',Orientation:'hor',State:'published',ProductStatus:'activated',Variable:'no',CoatingType:'none'},dimensions:{Width:{value:420,measureUnit:'mm'},Height:{value:297,measureUnit:'mm'}},supportedCountries:['MX']},
  {productUid:'poster-contract-fixture-A3-silk',attributes:{PaperType:'170-gsm-coated-silk',PaperFormat:'A3',Orientation:'ver',State:'published',ProductStatus:'activated',Variable:'no',CoatingType:'none'},dimensions:{Width:{value:297,measureUnit:'mm'},Height:{value:420,measureUnit:'mm'}},supportedCountries:['MX']},
]

export function observedPostersFetch({products=simulatedPosters,calls=[],ignoreFilters=false}={}) {
  const schema=observedPostersResponse.schema
  const observed=observedPostersResponse.candidates.map(row=>({productUid:row.externalId,attributes:row.sourceAttributes,supportedCountries:row.countries,
    dimensions:{Width:{value:row.widthMm,measureUnit:'mm'},Height:{value:row.heightMm,measureUnit:'mm'}}}))
  const rows=[...observed,...products]
  return async(url,options)=>{
    const body=options.body && JSON.parse(options.body);calls.push({url,body})
    if(url.endsWith('/catalogs'))return Response.json([{catalogUid:'posters',title:'Posters'}])
    if(url.endsWith('/catalogs/posters'))return Response.json({catalogUid:'posters',title:'Posters',productAttributes:schema.attributes.map(attr=>({productAttributeUid:attr.id,title:attr.title,values:attr.values.map(value=>({productAttributeValueUid:value.id,title:value.title}))}))})
    if(body) {
      const matching=ignoreFilters ? rows : rows.filter(row=>Object.entries(body.attributeFilters || {}).every(([key,values])=>values.includes(row.attributes[key])))
      // Deliberately polluted facets: presentation options must use matched products.
      return Response.json({products:matching.slice(body.offset,body.offset+body.limit),hits:{attributeHits:{PaperFormat:{'210x279-mm':999,A2:1,A3:1},State:{published:999}}}})
    }
    const uid=decodeURIComponent(url.split('/products/')[1] || '')
    return Response.json(rows.find(row=>row.productUid===uid))
  }
}
