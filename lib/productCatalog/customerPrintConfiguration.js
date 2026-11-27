import {variantOrientation} from './configuration.js'

export const printChoiceOrder = ['paper','frame','size','border']

const absent = /^(?:none|null|undefined|n\/?a|not applicable|sin marco|-+)$/i
const meaningful = value => typeof value==='string' && value.trim() && !absent.test(value.trim()) ? value.trim() : ''

export function frameProfileFromSku(sku) {
  const match = typeof sku === 'string' && sku.match(/(?:^|_)w(\d+(?:\.\d+)?)xt(\d+(?:\.\d+)?)-mm(?:_|$)/i)
  if (!match || !(Number(match[1]) > 0 && Number(match[2]) > 0)) return null
  return { widthMm:Number(match[1]), depthMm:Number(match[2]) }
}

export function customerPrintChoices(variant) {
  const attrs=Object.fromEntries((variant.attributes || []).map(({code,value})=>[code,meaningful(value)]))
  const family=variant.productFamily || ''
  const framed=family.startsWith('framed_') || Boolean(variant.frameProfile || attrs.frame_material || attrs.frame_color || (attrs.frame && attrs.frame!=='unframed'))
  const frameMaterial = framed ? attrs.frame_material || attrs.frame || '' : ''
  const frameColor = framed ? attrs.frame_color || '' : ''
  const profile = variant.frameProfile
  const unframed = /^(?:poster|fine_art_print|canvas)$/.test(family) || /^(?:none|unframed|sin marco)$/i.test(
    (variant.attributes || []).find(({code})=>code==='frame' || code==='framing')?.value || '',
  )
  const frame = framed ? JSON.stringify([frameColor,frameMaterial,profile?.widthMm || null,profile?.depthMm || null])
    : unframed ? 'unframed' : ''
  const size=meaningful(String(variant.size || attrs.size || ''))
  const geometry=variant.previewGeometry
  const measured=geometry && variantOrientation({...geometry,attributes:attrs})
  const orientation=measured && !measured.conflict ? measured.orientation || '' : ''
  const included=variant.presentationBorder
  const includedValue=Number(included?.value)
  const includedValid=['none','mm','percent'].includes(included?.unit) && included?.value != null && included.value !== '' && Number.isFinite(includedValue) && includedValue>=0
  const border=includedValid ? included.unit==='percent' && includedValue>0 ? 'percent:'+includedValue : included.unit==='none' ? '0' : String(includedValue)
    : Number.isFinite(geometry?.borderMm) && geometry.borderMm>=0 ? String(geometry.borderMm) : ''
  return {
    paper:attrs.paper || attrs.material || (family.endsWith('canvas') ? 'canvas' : ''),
    framing:framed ? 'framed' : 'unframed',
    frame, frame_material:frameMaterial, frame_color:frameColor,
    size:/^a\d+$/i.test(size) ? size.toUpperCase() : size, orientation, border,
  }
}

export function resolveCustomerPrint(variants, previous, field, value) {
  if (!previous || !value || !printChoiceOrder.includes(field)) return null
  const current = customerPrintChoices(previous)
  const retained = [...printChoiceOrder.filter(key=>key!==field),'orientation']
  let best = null
  let bestScore = -1
  for (const row of variants) {
    if (row.artworkId!==previous.artworkId) continue
    const choices = customerPrintChoices(row)
    if (choices[field]!==value) continue
    const unchanged = retained.filter(key=>current[key] && choices[key]===current[key]).length
    const score = 4 * unchanged + (row.id===previous.id ? 2 : row.productId===previous.productId ? 1 : 0)
    if (score>bestScore) {
      best = row
      bestScore = score
    }
  }
  return best
}

export function customerPrintOptions(variants, selected, field) {
  if (!selected || !printChoiceOrder.includes(field)) return []
  const current = customerPrintChoices(selected)
  const values = new Map()
  for (const variant of variants) {
    if (variant.artworkId!==selected.artworkId) continue
    const choices = customerPrintChoices(variant)
    const value = choices[field]
    if (!value || values.get(value)) continue
    values.set(value,printChoiceOrder.every(key=>key===field || choices[key]===current[key]))
  }
  return [...values].map(([value,compatible])=>({value,compatible}))
}

const titleCase = text => text.replace(/(^|\s)(\p{L})/gu, (_,space,letter)=>space+letter.toUpperCase())

export function customerPrintLabel(field,value,t) {
  if (field==='frame' && value) {
    if (value==='unframed') return t('Sin Marco','No Frame')
    const [color,material,width,depth] = JSON.parse(value)
    const label = [color,material].filter(Boolean).map(part=>customerPrintLabel('frame_part',part,t)).join(' · ')
    const dimensions = width && (depth ? `${width} × ${depth} mm` : `${width} mm`)
    return [label || (!dimensions && t('Con Marco','Framed')),dimensions].filter(Boolean).join(' · ')
  }
  if (field==='border' && value) return value==='0' ? t('Sin Borde','No Margin') : value.startsWith('percent:') ? `${value.slice(8)} %` : `${value} mm`
  if (!value) return t('Sin especificar','Not specified')
  const known = {
    portrait:['Vertical','Portrait'],landscape:['Horizontal','Landscape'],square:['Cuadrada','Square'],
    framed:['Con marco','Framed'],unframed:['Sin marco','Unframed'],
    wood:['Madera','Wood'],aluminum:['Aluminio','Aluminum'],aluminium:['Aluminio','Aluminum'],
    black:['Negro','Black'],white:['Blanco','White'],natural:['Natural','Natural'],
    'natural wood':['Madera natural','Natural wood'],canvas:['Lienzo','Canvas'],
  }
  const key=value.toLowerCase().replace(/[-_]+/g,' ').trim()
  if (Object.hasOwn(known,key)) return titleCase(t(...known[key]))
  if(field==='paper') {
    const text=key.replace(/(\d+)\s*gsm\b/g,'$1 g/m²')
    const spanish=text.replace(/offwhite archival/g,'archival en blanco cálido')
      .replace(/uncoated/g,'sin recubrimiento').replace(/coated silk/g,'satinado')
      .replace(/enhanced matte/g,'mate mejorado').replace(/premium matte/g,'mate premium')
      .replace(/cotton/g,'algodón').replace(/matte/g,'mate')
    return titleCase(t(spanish,text))
  }
  return titleCase(value.replace(/[-_]+/g,' ').replace(/(\d)x(?=\d)/gi,'$1 × '))
}
