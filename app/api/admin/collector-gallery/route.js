import { galleryHandler } from '@/lib/collectorGallery.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handle = galleryHandler('admin')
export const GET = handle
export const POST = handle
export const PATCH = handle
