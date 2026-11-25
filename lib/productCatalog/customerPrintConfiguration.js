import {variantOrientation} from './configuration.js'

export const printChoiceOrder = ['paper','framing','frame_material','frame_color','size','orientation','border']

const absent = /^(?:none|null|undefined|n\/?a|not applicable|sin marco|-+)$/i
const meaningful = value => typeof value==='string' && value.trim() && !absent.test(value.trim()) ? value.trim() : ''

export function customerPrintChoices(variant) {
  const attrs=Object.fromEntries((variant.attributes || []).map(({code,value})=>[code,meaningful(value)]))
  const family=variant.productFamily || ''
  const framed=family.startsWith('framed_') || Boolean(attrs.frame_material || attrs.frame_color || attrs.frame)
  const size=meaningful(String(variant.size || attrs.size || ''))
  const geometry=variant.previewGeometry
  const measured=geometry && variantOrientation({...geometry,attributes:attrs})
  const orientation=measured && !measured.conflict ? measured.orientation || '' : ''
  const included=variant.presentationBorder
  const includedValue=Number(included?.value)
  const includedValid=['none','mm','percent'].includes(included?.unit) && Number.isFinite(includedValue) && includedValue>=0
  const border=includedValid ? included.unit==='percent' && includedValue>0 ? 'percent:'+includedValue : included.unit==='none' ? '0' : String(includedValue)
    : Number.isFinite(geometry?.borderMm) && geometry.borderMm>=0 ? String(geometry.borderMm) : ''
  return {
    paper:attrs.paper || attrs.material || (family.endsWith('canvas') ? 'canvas' : ''),
    framing:framed ? 'framed' : 'unframed',
    frame_material:framed ? attrs.frame_material || attrs.frame || '' : '',
    frame_color:framed ? attrs.frame_color || '' : '',
    size:/^a\d+$/i.test(size) ? size.toUpperCase() : size, orientation, border,
  }
}

export function customerPrintOptions(variants, selected, field) {
  if (!selected || !printChoiceOrder.includes(field)) return []
  const preceding=printChoiceOrder.slice(0,printChoiceOrder.indexOf(field))
  const current=customerPrintChoices(selected)
  return [...new Set(variants.filter(variant=>{
    const choices=customerPrintChoices(variant)
    return variant.artworkId===selected.artworkId && preceding.every(key=>choices[key]===current[key])
  }).map(variant=>customerPrintChoices(variant)[field]))]
}

// Filter real rows first, then retain compatible later choices in order.
export function resolveCustomerPrint(variants, previous, field, value) {
  if (!previous || !printChoiceOrder.includes(field)) return null
  const current=customerPrintChoices(previous)
  const index=printChoiceOrder.indexOf(field)
  let matches=variants.filter(row=>{
    const choices=customerPrintChoices(row)
    return row.artworkId===previous.artworkId && choices[field]===value && printChoiceOrder.slice(0,index).every(key=>choices[key]===current[key])
  })
  for (const key of printChoiceOrder.slice(index+1)) {
    const compatible=matches.filter(row=>customerPrintChoices(row)[key]===current[key])
    if (compatible.length) matches=compatible
  }
  return matches.find(row=>row.id===previous.id) || matches.find(row=>row.productId===previous.productId) || matches[0] || null
}

export function customerPrintLabel(field,value,t) {
  if (field==='border' && value) return value==='0' ? t('Sin borde','No margin') : value.startsWith('percent:') ? `${value.slice(8)} %` : `${value} mm`
  if (!value) return t('Sin especificar','Not specified')
  const known = {
    portrait:['Vertical','Portrait'],landscape:['Horizontal','Landscape'],square:['Cuadrada','Square'],
    framed:['Con marco','Framed'],unframed:['Sin marco','Unframed'],
    wood:['Madera','Wood'],aluminum:['Aluminio','Aluminum'],aluminium:['Aluminio','Aluminum'],
    black:['Negro','Black'],white:['Blanco','White'],natural:['Natural','Natural'],
    'natural wood':['Madera natural','Natural wood'],canvas:['Lienzo','Canvas'],
  }
  const key=value.toLowerCase().replace(/[-_]+/g,' ').trim()
  if (Object.hasOwn(known,key)) return t(...known[key])
  if(field==='paper') {
    const text=key.replace(/(\d+)\s*gsm\b/g,'$1 g/m²')
    const spanish=text.replace(/offwhite archival/g,'archival en blanco cálido')
      .replace(/uncoated/g,'sin recubrimiento').replace(/coated silk/g,'satinado')
      .replace(/enhanced matte/g,'mate mejorado').replace(/premium matte/g,'mate premium')
      .replace(/cotton/g,'algodón').replace(/matte/g,'mate')
    return t(spanish,text)
  }
  return value.replace(/[-_]+/g,' ').replace(/(\d)x(?=\d)/gi,'$1 × ')
}
