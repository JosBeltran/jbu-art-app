import { galleryHandler } from '@/lib/collectorGallery.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handle = galleryHandler('public')
export const GET = handle
