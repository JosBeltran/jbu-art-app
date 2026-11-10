export const PRINT_FINISHES = ['FINE_ART', 'CANVAS', 'GLOSS', 'MATTE', 'RESIN']
export const PRINT_EDITIONS = ['OPEN', 'LIMITED']
export const isPrintId = value => typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)

export const PRINT_FIELDS = [
  'artwork_id', 'title', 'title_en', 'description', 'description_en', 'sku',
  'size', 'finish', 'paper_type', 'framing', 'price', 'currency', 'edition_type',
  'max_edition_size', 'sort_order', 'is_active',
]

const empty = {
  artwork_id: '', title: '', title_en: '', description: '', description_en: '', sku: '',
  size: '', finish: 'FINE_ART', paper_type: '', framing: '', price: '', currency: 'MXN',
  edition_type: 'OPEN', max_edition_size: '', sort_order: 0, is_active: false,
  image_key: '', image_url: '',
}

export function printForm(row, artwork) {
  if (!row) return { ...empty, artwork_id: artwork?.id || '' }
  const fields = Object.fromEntries(PRINT_FIELDS.map(key => [key, row[key] ?? empty[key]]))
  return {
    ...fields,
    title: row.title || artwork?.title || '',
    image_key: row.print_gallery_image_id ? 'gallery:' + row.print_gallery_image_id :
      row.print_provenance_image_id ? 'provenance:' + row.print_provenance_image_id :
        row.image_url ? row.image_url === artwork?.primary_image_url ? 'primary' : 'upload' : '',
    image_url: row.image_url || '',
  }
}

export function nextPrintForm(form, duplicate) {
  const common = {
    ...empty, artwork_id: form.artwork_id, size: form.size, finish: form.finish,
    paper_type: form.paper_type, framing: form.framing, edition_type: form.edition_type,
  }
  return duplicate ? {
    ...common, title: form.title, title_en: form.title_en, description: form.description,
    description_en: form.description_en, image_key: form.image_key, image_url: form.image_url,
    sort_order: form.sort_order,
  } : common
}

export function validatePrintForm(input) {
  if (!isPrintId(input?.id) || !isPrintId(input.artwork_id) || typeof input.is_active !== 'boolean' ||
    typeof input.create !== 'boolean') throw new Error('invalid_print')
  const result = { id: input.id, artwork_id: input.artwork_id, is_active: input.is_active }
  for (const [key, limit] of Object.entries({
    title: 200, title_en: 200, description: 10000, description_en: 10000,
    sku: 100, size: 120, paper_type: 200, framing: 200,
  })) {
    const value = input[key] ?? ''
    if (typeof value !== 'string' || value.trim().length > limit) throw new Error('invalid_print')
    result[key] = value.trim() || null
  }
  if (!result.title || !result.size) throw new Error('required_print_fields')
  if (input.currency !== 'MXN') throw new Error('invalid_print_currency')
  if (!PRINT_FINISHES.includes(input.finish) || !PRINT_EDITIONS.includes(input.edition_type))
    throw new Error('invalid_print_format')
  const price = String(input.price ?? '')
  if (!['string', 'number'].includes(typeof input.price) || !/^\d{1,8}(?:\.\d{1,2})?$/.test(price) || Number(price) <= 0)
    throw new Error('invalid_print_price')
  const sortOrder = Number(input.sort_order ?? 0)
  if ((input.sort_order != null && !['string', 'number'].includes(typeof input.sort_order)) || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 2147483647)
    throw new Error('invalid_print_sort')
  const limit = Number(input.max_edition_size)
  if (input.edition_type === 'LIMITED' && (!['string', 'number'].includes(typeof input.max_edition_size) || !Number.isInteger(limit) || limit < 1 || limit > 2147483647))
    throw new Error('invalid_print_edition_size')
  return {
    ...result, currency: input.currency, price: Number(price), finish: input.finish, edition_type: input.edition_type,
    sort_order: sortOrder, max_edition_size: input.edition_type === 'LIMITED' ? limit : null,
  }
}

export function printImageFields(key, url, artwork, supabaseUrl, previous) {
  const result = { image_url: null, print_gallery_image_id: null, print_provenance_image_id: null }
  if (!key) return result
  if (key === 'primary' && artwork.primary_image_url) return { ...result, image_url: artwork.primary_image_url }
  if (key === 'upload' && typeof url === 'string' && url.length <= 2000) {
    const base = supabaseUrl?.replace(/\/$/, '') + '/storage/v1/object/public/artworks/'
    const path = url.startsWith(base) ? url.slice(base.length) : ''
    if (url === previous?.image_url || /^artwork-images\/prints\/[\w-]+\.(?:jpe?g|png|webp)$/i.test(path))
      return { ...result, image_url: url }
  }
  if (typeof key === 'string') {
    const [source, id, extra] = key.split(':')
    if (!extra && isPrintId(id)) {
      if (source === 'gallery') return { ...result, print_gallery_image_id: id }
      if (source === 'provenance') return { ...result, print_provenance_image_id: id }
    }
  }
  throw new Error('invalid_print_image')
}
