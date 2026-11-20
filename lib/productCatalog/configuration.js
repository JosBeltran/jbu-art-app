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
