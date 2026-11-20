import {isUnrelatedProduct,wallArtGroup,wallArtFamilies} from './wallArt.js'

// Commercial rules v1. Attribute values are supplier values, never manufactured UIDs.
export const PRESENTATION_VERSION=1
export const presentationCategories={
  posters:['poster',['posters']],fine_art:['fine_art_print',['fine-art']],
  framed:['framed_print',['framed-posters','mounted-framed-posters','fine-art-framed-poster']],
  canvas:['canvas',['canvas']],framed_canvas:['framed_canvas',['framed-canvas']],
  acrylic:['acrylic',['acrylic']],metal:['metal',['metal','metallic','aluminium']],wood:['wood',['wood']],
}
const labels={
  size:['Tamaño','Size'],orientation:['Orientación','Orientation'],paper:['Papel','Paper'],
  finish:['Acabado','Finish'],material:['Material','Material'],frame_material:['Material del marco','Frame material'],
  frame_color:['Color del marco','Frame color'],glazing:['Cubierta','Glazing'],mount:['Montaje','Mounting'],
}
const aliases={size:['PaperFormat','UnifiedPaperFormat','FrameSize','Size'],orientation:['Orientation'],
  paper:['PaperType','UnifiedPaperType','Paper'],finish:['CoatingType','SurfaceFinish','Finish'],
  material:['Material','CanvasType','AcrylicThickness','Thickness'],frame_material:['FrameMaterial','framematerial'],
  frame_color:['FrameColor','FrameColour','framecolour','framecolor'],glazing:['Glazing','Glaze','glaze'],mount:['Mount','Matboard','Mat']}
const allowed={poster:['size','orientation','paper','finish'],fine_art_print:['size','orientation','paper','finish'],
  framed_print:['size','orientation','paper','finish','frame_material','frame_color','glazing','mount'],
  canvas:['size','orientation','material','finish'],framed_canvas:['size','orientation','material','finish','frame_material','frame_color'],
  acrylic:['size','orientation','material','finish','mount'],metal:['size','orientation','material','finish','mount'],wood:['size','orientation','material','finish','mount']}
const names={framed_print:['Póster enmarcado','Framed poster'],canvas:['Impresión en lienzo','Canvas print'],framed_canvas:['Lienzo enmarcado','Framed canvas']}
const image={kind:'placeholder',url:null,permission:'unavailable',source:null}
const record=value=>value && typeof value==='object' && !Array.isArray(value) ? value : {}

export function categoryForCatalog(catalogId) {
  return Object.entries(presentationCategories).find(([,value])=>value[1].includes(catalogId))?.[0]
}
export function configurationFields(schema,definition) {
  return (allowed[definition.family] || []).flatMap(code=>{
    const source=(aliases[code] || [code]).map(id=>schema.attributes.find(row=>row.id===id)).find(Boolean)
    return source && !Object.hasOwn(definition.filters,source.id) ? [{...source,code,labels:labels[code]}] : []
  })
}
// Unit equivalence is explicit in supplied UnifiedPaperType titles (gsm / lb cover).
// Never equate sizes in inches/mm or infer an attribute from a UID.
function paperStock(value) {
  const match=/^(\d+)-gsm-(?:(\d+)lb-)?(uncoated(?:-offwhite-archival)?|coated-silk)$/.exec(value)
  return match ? {gsm:match[1],lb:match[2],finish:match[3]} : null
}
function stockValues(schema,value) {
  const stock=paperStock(value)
  if(!stock)return []
  return (schema.attributes.find(row=>row.id==='PaperType')?.values || []).filter(option=>
    [value,`${stock.gsm}-gsm-${stock.finish}`,...(stock.lb ? [`${stock.lb}-lb-cover-${stock.finish}`] : [])].includes(option.id)).map(option=>option.id)
}
function base(provider,catalogId,family,id,titles,filters,summary) {
  return {id,presentationId:id,version:PRESENTATION_VERSION,provider,catalogId,catalogRefs:[{provider,catalogId}],
    category:categoryForCatalog(catalogId) || family,group:family,family,titles,description:summary,materialSummary:summary,
    filters,relevantAttributes:allowed[family] || [],rules:{version:PRESENTATION_VERSION,rejectUnrelated:true,requireMatchingFamily:true},
    eligibility:{freshResolution:true,exactIdentity:true},image,
    capabilities:{dependentOptions:true,artworkGuidance:true,destinationCost:provider==='gelato'}}
}
export function presentationDefinitions(provider,catalogId,schema) {
  const family=provider==='gelato' ? presentationCategories[categoryForCatalog(catalogId)]?.[0] : wallArtGroup(schema)
  if(!family)return []
  if(provider==='gelato' && catalogId==='posters') {
    // Real supplied stock definitions: not a guess at the supplier storefront's card count.
    return (schema.attributes.find(row=>row.id==='UnifiedPaperType')?.values || []).flatMap(option=>{
      const stock=paperStock(option.id),values=stockValues(schema,option.id)
      if(!stock || !values.length)return []
      const finish=stock.finish==='coated-silk' ? ['satinado','silk coated'] : stock.finish.includes('archival') ? ['sin recubrimiento, blanco cálido archival','uncoated off-white archival'] : ['sin recubrimiento','uncoated']
      const titles=[`Póster ${stock.gsm} g/m² ${finish[0]}`,`${stock.gsm} gsm ${finish[1]} poster`]
      return [base(provider,catalogId,family,`jbu:poster:${stock.gsm}gsm-${stock.finish}`,titles,{PaperType:values},
        [`Papel de ${stock.gsm} g/m² ${finish[0]}. Impresión para arte mural sin marco.`,`${stock.gsm} gsm ${finish[1]} paper. Unframed wall art print.`])]
    })
  }
  const material=schema.attributes.find(row=>['FrameMaterial','framematerial','CanvasType','Material'].includes(row.id))
  const options=material?.values?.length ? material.values.slice(0,8) : [null]
  return options.map(option=>{
    const titles=(names[family] || wallArtFamilies[family]).map(title=>title+(option ? ' · '+option.title : ''))
    // Parent identity remains part of the binding; JBU presentation IDs are versioned snapshots.
    const id=`jbu:${family}:${encodeURIComponent(catalogId)}${option ? ':'+encodeURIComponent(option.id) : ''}`
    return base(provider,catalogId,family,id,titles,option ? {[material.id]:[option.id]} : {},
      titles.map(title=>title+'.'))
  })
}
export function presentationFilters(definition,selection={}) {
  return {...definition.filters,...Object.fromEntries(Object.entries(selection).filter(([,value])=>value).map(([key,value])=>[key,[value]]))}
}
export function presentationMatches(definition,product,variant) {
  const attributes={...record(variant.attributes),...record(variant.configuration)}
  if(isUnrelatedProduct([product.externalId,product.title].filter(Boolean).join(' ')))return false
  // Product family signals can veto a catalog binding, which by itself is insufficient.
  const explicitFamily=attributes.ProductType || attributes.ProductFamily
  const reportedFamily=explicitFamily && wallArtGroup({category:explicitFamily})
  if(explicitFamily && (!reportedFamily || reportedFamily!==definition.family))return false
  const family=wallArtGroup({externalId:product.externalId,title:product.title,category:explicitFamily})
  if(family && family!==definition.family)return false
  if(isUnrelatedProduct(String(explicitFamily || '')))return false
  if(!family && definition.provider==='gelato' && !Object.keys(definition.filters).length)return false
  if(attributes.State && attributes.State!=='published' || attributes.ProductStatus && attributes.ProductStatus!=='activated' ||
    attributes.Variable && attributes.Variable!=='no')return false
  if(definition.family==='poster' && ['SpotFinishingType','ProtectionType','ShapeEdgeType'].some(key=>attributes[key] && attributes[key]!=='none'))return false
  return Object.entries(definition.filters).every(([key,values])=>values.includes(attributes[key]))
}
export function commercialAttributes(schema,definition,attributes) {
  return Object.fromEntries(configurationFields(schema,{...definition,filters:{}}).flatMap(field=>attributes[field.id] ? [[field.code,attributes[field.id]]] : []))
}
