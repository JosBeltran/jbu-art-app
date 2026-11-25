import {PRINT_SIZE_CATALOG,artworkPrintSize,artworkPrintMatches} from './artworkPrintSizes.js'

export const printOrientation=(width,height)=>width>0 && height>0
  ? Math.abs(width/height-1)<0.01 ? 'square' : width>height ? 'landscape' : 'portrait' : null
export function printBorder(input={}) {
  const unit=input.border_unit ?? input.borderUnit ?? 'none'
  const value=unit==='none' ? 0 : Number(input.border_value ?? input.borderValue ?? 0)
  if(!['none','mm','percent'].includes(unit) || !Number.isFinite(value) || value<0 ||
    (unit==='percent' && value>=50) || (unit==='mm' && value>500))throw new Error('invalid_print_border')
  return {unit,value}
}
export function printBorderMm(input,size=artworkPrintSize(input)) {
  const {unit,value}=printBorder(input),preset=PRINT_SIZE_CATALOG[size]
  if(!preset)throw new Error('invalid_print_size')
  const edge=Math.min(...preset.mm)
  const mm=unit==='percent' ? edge*value/100 : unit==='mm' ? value : 0
  if(2*mm>=edge)throw new Error('invalid_print_border')
  return mm
}
export const printBorderLabel=input=>{
  const {unit,value}=printBorder(input)
  return unit==='percent' ? value+' %' : (unit==='mm' ? value : 0)+' mm'
}
export function printPresentationKey(row,fallbackOrientation=null) {
  try {return [artworkPrintSize(row),row.orientation || fallbackOrientation || '?',printBorderMm(row).toFixed(2)].join('|')}
  catch {return null}
}
export function duplicatePrintPresentations(rows,fallbackOrientation=null) {
  const keys=new Map()
  for(const row of rows) {
    const presentation=printPresentationKey(row,fallbackOrientation)
    const key=presentation ? (row.artwork_id || '')+'|'+presentation : null
    if(key){if(!keys.has(key))keys.set(key,[]);keys.get(key).push(row.id)}
  }
  return [...keys.values()].filter(ids=>ids.length>1)
}
export function compatibleArtworkPrints(variant,rows,fallbackOrientation=null) {
  return rows.filter(row=>{
    const orientation=row.orientation || (!row.image_url && !row.print_gallery_image_id && !row.print_provenance_image_id ? fallbackOrientation : null)
    return orientation && artworkPrintMatches(variant,row,orientation)
  })
}
export function expandPrintPresentations(variants,prints,fallbackOrientation=null) {
  return (Array.isArray(variants)?variants:[variants]).flatMap(variant=>compatibleArtworkPrints(variant,prints,fallbackOrientation).map(print=>({
    ...variant,artworkPrintId:print.id,presentationPreview:print.preview_url || print.image_url || null,
    previewIsPrepared:print.preview_is_prepared===true,presentationBorderMm:printBorderMm(print),
    presentationOrientation:print.orientation || fallbackOrientation,
    attributes:{...variant.attributes,jbu_border:printBorderLabel(print)},
  })))
}

