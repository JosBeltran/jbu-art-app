import {marketChoices} from './commerce.js'
import {customerPrintChoices,printChoiceOrder} from './customerPrintConfiguration.js'

export const wallPrintFields=[...printChoiceOrder,'series','orientation']

export function wallPrintMatches(choices,filters) {
  return Object.entries(filters).every(([field,value])=>!value || choices[field]===value)
}

export function wallPrintSpecification(variant) {
  if(!variant)return null
  const choices=customerPrintChoices(variant)
  return printChoiceOrder.every(field=>choices[field]) ? Object.fromEntries(printChoiceOrder.map(field=>[field,choices[field]])) : null
}

export function resolveWallPrintSpecification(options,variant,target,geometry,masters,country,currency) {
  const {orientation}=customerPrintChoices(variant)
  const compatible=marketChoices(options,country,currency).filter(option=>wallPrintMatches(customerPrintChoices(option),{...target,orientation}))
  const match=compatible.find(option=>option.id===variant.id) || compatible[0]
  if(match)return {variant:match}
  if(!masters || !orientation)return {status:'unknown'}
  const {widthMm,heightMm}=geometry
  const borderMm=target.border.startsWith('percent:') ? Number(target.border.slice(8))*Math.min(widthMm,heightMm)/100
    : Number(target.border)
  const hasMaster=masters.some(master=>master.orientation===orientation &&
    Math.abs(Math.min(widthMm,heightMm)-Math.min(master.widthMm,master.heightMm))<=1 &&
    Math.abs(Math.max(widthMm,heightMm)-Math.max(master.widthMm,master.heightMm))<=1 &&
    Math.abs(borderMm-master.borderMm)<=0.15)
  return {status:hasMaster?'pending':'missing'}
}

const seriesName=value=>value?.trim().toUpperCase()

export function sameWallSeries(candidate,reference) {
  if(candidate.seriesId && reference.seriesId)return candidate.seriesId===reference.seriesId
  return Boolean(seriesName(candidate.series) && seriesName(candidate.series)===seriesName(reference.series))
}

export function wallPrintPage(catalog,{reference,referenceId,country,currency,offset,searchParams}) {
  const filters=Object.fromEntries(wallPrintFields.map(field=>[field,searchParams.get(field)]))
  const facets=Object.fromEntries(wallPrintFields.map(field=>[field,new Set()]))
  const matching=[]
  for(const group of catalog) {
    if(group[0].artworkId===referenceId)continue
    const available=marketChoices(group,country,currency)
    let matches=false
    for(const row of available) {
      const choices={...customerPrintChoices(row),series:row.series}
      for(const field of wallPrintFields)if(choices[field])facets[field].add(choices[field])
      if(wallPrintMatches(choices,filters))matches=true
    }
    if(matches)matching.push(available)
  }
  const priority=row=>Number(sameWallSeries(row,reference))*2+Number(Boolean(row.lineage && row.lineage===reference.lineage))
  matching.sort((a,b)=>priority(b[0])-priority(a[0]) || a[0].artworkId.localeCompare(b[0].artworkId))
  const related=matching.slice(offset,offset+6)
  return {
    related,
    facets:Object.fromEntries(wallPrintFields.map(field=>[field,[...facets[field]]])),
    nextOffset:offset+related.length<matching.length ? offset+related.length : null,
  }
}

export function wallPrintAffinity(candidate,active,lineage,colors) {
  if(!active)return 0
  const variant=active.variant
  const sameSeries=sameWallSeries(candidate,{series:active.series || variant?.series,seriesId:active.seriesId || variant?.seriesId})
  const sameFamily=candidate.productFamily===variant?.productFamily
  const alternate=candidate.artworkId!==active.artworkId && lineage[candidate.artworkId] &&
    lineage[candidate.artworkId]===lineage[active.artworkId]
  const {widthMm,heightMm}=candidate.previewGeometry
  const ratio=active.geometry.widthMm/active.geometry.heightMm
  const shape=widthMm/heightMm
  const sameOrientation=Math.sign(Math.log(shape))===Math.sign(Math.log(ratio))
  const color=colors?.[candidate.artworkId],base=colors?.[active.artworkId]
  const affinity=color && base ? 1-Math.hypot(...color.map((value,index)=>value-base[index]))/442 : 0.5
  return (alternate?6:0)+(sameSeries?4:0)+(sameFamily?1:0)+(sameOrientation?1:0)+
    Math.exp(-Math.abs(Math.log(shape/ratio)))+2*affinity
}
