// Genera versiones WebP (thumbnail / medium / large) de una imagen de obra.
// - Nunca modifica ni borra el original.
// - Solo redimensiona y comprime: sin nitidez, filtros ni correcciones de color.
// - Idempotente: si las tres versiones ya existen, no hace nada.
// - Solo administradores (token de sesión en Authorization).
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { getRequestUser, isAdminUser } from '@/lib/offersAuth'
import { BUCKET, IMAGE_VARIANTS, imageVariants, parseStorageUrl, urlExists, variantFolder } from '@/lib/mediaVariants'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

function clients(token) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const asUser = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  // Para subir: clave de servicio si existe; si no, la sesión del admin (las reglas del bucket ya le permiten subir).
  const writer = service ? createClient(url, service, { auth: { persistSession: false } }) : asUser
  return { asUser, writer }
}

export async function POST(request) {
  try {
    const header = request.headers.get('authorization') || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 })
    const { asUser, writer } = clients(token)
    const user = await getRequestUser(request, asUser)
    if (!(await isAdminUser(user, asUser))) return Response.json({ error: 'forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const url = typeof body?.url === 'string' ? body.url.slice(0, 2000) : ''
    const dryRun = Boolean(body?.dryRun)
    const force = Boolean(body?.force)
    const info = parseStorageUrl(url)
    const variants = imageVariants(url)
    if (!info || !variants) return Response.json({ status: 'unsupported', url })

    if (!force) {
      const exists = await Promise.all(IMAGE_VARIANTS.map(({ name }) => urlExists(variants[name])))
      if (exists.every(Boolean)) return Response.json({ status: 'skipped', url })
    }
    if (dryRun) return Response.json({ status: 'pending', url })

    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return Response.json({ status: 'failed', url, error: `original ${res.status}` })
    const input = Buffer.from(await res.arrayBuffer())
    const originalBytes = input.length
    const meta = await sharp(input, { limitInputPixels: 268402689 }).metadata()

    const folder = variantFolder(info.path)
    const results = []
    for (const v of IMAGE_VARIANTS) {
      const out = await sharp(input, { limitInputPixels: 268402689 })
        .rotate() // respeta la orientación EXIF, sin otros cambios
        .resize({ width: v.width, withoutEnlargement: true })
        .webp({ quality: v.quality, effort: 4, smartSubsample: true })
        .toBuffer({ resolveWithObject: true })
      const { error } = await writer.storage.from(BUCKET).upload(`${folder}/${v.name}.webp`, out.data, {
        contentType: 'image/webp',
        cacheControl: '31536000',
        upsert: true,
      })
      if (error) throw new Error(`${v.name}: ${error.message}`)
      results.push({ name: v.name, width: out.info.width, height: out.info.height, bytes: out.data.length })
    }

    return Response.json({
      status: 'optimized',
      url,
      width: meta.width,
      height: meta.height,
      originalBytes,
      optimizedBytes: results.reduce((n, r) => n + r.bytes, 0),
      variants: results,
    })
  } catch (err) {
    return Response.json({ status: 'failed', error: err?.message || String(err) }, { status: 200 })
  }
}
