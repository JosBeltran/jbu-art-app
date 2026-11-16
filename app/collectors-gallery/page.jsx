import CollectorGallery from '@/components/collector-gallery/CollectorGallery'
import { COLLECTORS_GALLERY_PATH } from '@/lib/publicNavigation'
import { SITE_URL } from '@/lib/seo'

export const metadata = {
  title: 'Obras en su nuevo espacio',
  description: 'Fotografías auténticas que nuestros clientes han compartido con JBU.',
  alternates: { canonical: SITE_URL + COLLECTORS_GALLERY_PATH },
}

export default function CollectorsGalleryPage() {
  return <CollectorGallery />
}
