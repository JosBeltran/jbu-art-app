/** Shared configuration rules. The input is either reported supplier combinations or approved JBU variants. */
export function matchesAttributes(attributes,selection) {
  return Object.entries(selection || {}).every(([key,value])=>!value || attributes[key]===value)
}
export function exactCombinations(variant) {
  if(variant.combinations?.length)return variant.combinations.map(row=>row.attributes).filter(row=>row && typeof row==='object' && !Array.isArray(row))
  return Object.keys(variant.options || {}).length ? [] : [{}]
}
export function artworkGeometry({widthPx,heightPx}={}) {
  if(!(widthPx>0 && heightPx>0))return {known:false,widthPx:null,heightPx:null,orientation:null,aspectRatio:null}
  const aspectRatio=widthPx/heightPx
  return {known:true,widthPx,heightPx,aspectRatio,orientation:Math.abs(aspectRatio-1)<0.01 ? 'square' : aspectRatio>1 ? 'landscape' : 'portrait'}
}
export function configurationCompatibility(geometry,variant,fit='contain') {
  if(!geometry?.known || !(variant.widthMm>0 && variant.heightMm>0))return {known:false,requiresProductionValidation:true}
  const target=variant.widthMm/variant.heightMm
  const unusedFraction=1-Math.min(geometry.aspectRatio/target,target/geometry.aspectRatio)
  const ratios=[geometry.widthPx/variant.widthMm,geometry.heightPx/variant.heightMm]
  const effectiveDpi=Math.floor(25.4*(fit==='cover' ? Math.min(...ratios) : Math.max(...ratios)))
  return {known:true,effectiveDpi,cropFraction:fit==='cover' ? unusedFraction : 0,
    borderFraction:fit==='contain' ? unusedFraction : 0,recommended:effectiveDpi>=240 && unusedFraction<=0.1,requiresProductionValidation:true}
}
export function attributeOptions(rows,selection={}) {
  const matching=rows.filter(row=>matchesAttributes(row.attributes,selection))
  const keys=[...new Set(rows.flatMap(row=>Object.keys(row.attributes)))]
  return Object.fromEntries(keys.map(key=>[key,[...new Set(matching.map(row=>row.attributes[key]).filter(Boolean))]]))
}
export function approvedConfigurations(variants,productId) {
  return variants.filter(row=>row.productId===productId).map(row=>({...row,attributes:Object.fromEntries(row.attributes.map(attr=>[attr.code,String(attr.value)]))}))
}

export function variantOrientation(variant) {
  const declared = {ver:'portrait',hor:'landscape',portrait:'portrait',landscape:'landscape',square:'square',
    vertical:'portrait',horizontal:'landscape'}[String(variant.attributes?.orientation || '').toLowerCase()]
  const measured = artworkGeometry({widthPx:variant.widthMm,heightPx:variant.heightMm}).orientation
  return {orientation:measured || declared || null, conflict:Boolean(measured && measured!=='square' && declared && measured!==declared)}
}

export function previewConfiguration(rows, focus, identity) {
  return rows.find(row=>identity(row)===focus) || (rows.length===1 ? rows[0] : null)
}

export function mockupVariant(row) {
  return {
    widthMm:row.wall_art_mockups.width_mm,heightMm:row.wall_art_mockups.height_mm,
    attributes:Object.fromEntries((row.product_variant_attribute_values || []).map(attribute=>
      [attribute.attribute_code,attribute.text_value ?? attribute.enum_value])),
  }
}

export function mockupAppearance(variant, borderMm, framed) {
  const width = Number(variant?.widthMm)
  const height = Number(variant?.heightMm)
  if (!(width>0 && height>0) || variantOrientation(variant).conflict) return null
  const colors = {black:'#252323',white:'#f7f5ef',natural:'#a57b50','natural wood':'#a57b50',
    oak:'#ae8559',silver:'#b5b8bc',gold:'#b99b62',brown:'#654932'}
  const color = String(variant.attributes?.frame_color || '').toLowerCase().replace(/[-_]+/g,' ')
  const material = String(variant.attributes?.frame_material || '').toLowerCase()
  const border = borderMm>0 && 2*borderMm<Math.min(width,height) ? borderMm : 0
  return {ratio:width/height,frameColor:framed ? (colors[color] || '#81776e') : null,
    frameWidth:material.includes('alumin') || material.includes('metal') ? '0.18rem' : '0.35rem',
    insetX:100*border/width,insetY:100*border/height}
}
