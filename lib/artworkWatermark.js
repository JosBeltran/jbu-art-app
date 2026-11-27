import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const logos = ['blanco', 'morado']
const sampleSize = 32
const watermarkOpacity = 0.68

async function logoPixels(color, size) {
  const path = join(process.cwd(), 'public', 'images', 'watermarks', `jbu-logo-instagram-${color}.png`)
  return sharp(await readFile(path)).resize(size, size).toColourspace('srgb').ensureAlpha().raw().toBuffer()
}

function contrast(background, logo) {
  let score = 0
  for (let pixel = 0; pixel < logo.length; pixel += 4) {
    const difference = Math.abs(background[pixel] - logo[pixel]) * 0.21
      + Math.abs(background[pixel + 1] - logo[pixel + 1]) * 0.72
      + Math.abs(background[pixel + 2] - logo[pixel + 2]) * 0.07
    score += difference * logo[pixel + 3]
  }
  return score
}

export async function watermarkArtwork(input) {
  const { data, info: { width, height } } = await sharp(input, { limitInputPixels: 60_000_000 })
    .rotate().resize(2600, 2600, { fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const image = sharp(data, { raw: { width, height, channels: 4 } })
  // The supplied logos include transparent padding. The visible mark covers
  // about a quarter of the short side and stays inside the artwork on zoom.
  const size = Math.max(1, Math.round(Math.min(width, height) * 0.39))
  const left = Math.floor((width - size) / 2)
  const top = Math.floor((height - size) / 2)
  const [background, white, purple] = await Promise.all([
    image.clone().extract({ left, top, width: size, height: size })
      .resize(sampleSize, sampleSize).raw().toBuffer(),
    ...logos.map(color => logoPixels(color, sampleSize)),
  ])
  const index = contrast(background, white) >= contrast(background, purple) ? 0 : 1
  const logo = await logoPixels(logos[index], size)
  for (let alpha = 3; alpha < logo.length; alpha += 4) {
    logo[alpha] = Math.round(logo[alpha] * watermarkOpacity)
  }
  return image.composite([{ input: logo, raw: { width: size, height: size, channels: 4 }, top, left }])
    .webp({ quality: 87 }).toBuffer()
}
