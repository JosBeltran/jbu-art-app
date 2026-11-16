import sharp from 'sharp'

export const GALLERY_BUCKET = 'collector-gallery'
export const MAX_GALLERY_UPLOAD = 4 * 1024 * 1024
export const PHOTO_TYPES = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

export const mediaPath = (id, variant) => `${id}/${variant === 'original' ? 'original.jpg' : variant + '.webp'}`

export async function prepareGalleryPhoto(input, mime) {
  if (!input.length || input.length > MAX_GALLERY_UPLOAD) throw new Error('invalid_photo')
  const photo = sharp(input, { limitInputPixels: 32_000_000 })
  const meta = await photo.metadata()
  if (!Object.hasOwn(PHOTO_TYPES, meta.format) || PHOTO_TYPES[meta.format] !== mime || (meta.pages ?? 1) !== 1) {
    throw new Error('invalid_photo')
  }
  const [full, thumb] = await Promise.all([
    photo.clone().rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 87 }).toBuffer({ resolveWithObject: true }),
    photo.clone().rotate().resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 }).toBuffer(),
  ])
  return { full: full.data, thumb, width: full.info.width, height: full.info.height }
}

export async function saveGalleryPhoto(bucket, id, photo, original) {
  if (original) {
    const { error } = await bucket.upload(mediaPath(id, 'original'), original, { contentType: 'image/jpeg', upsert: true })
    if (error) throw error
  }
  for (const variant of ['full', 'thumb']) {
    const { error } = await bucket.upload(mediaPath(id, variant), photo[variant], { contentType: 'image/webp', upsert: true })
    if (error) throw error
  }
}
