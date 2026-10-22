import PreviewClient from './PreviewClient'
export const metadata = {
  title: 'Admin — View as Collector | JBU',
  description: 'Vista administrativa privada de colección, solo lectura.',
  robots: { index: false, follow: false },
  openGraph: { title: 'Admin — View as Collector | JBU', description: 'Vista administrativa privada de colección, solo lectura.', type: 'website' },
  twitter: { card: 'summary', title: 'Admin — View as Collector | JBU', description: 'Vista administrativa privada de colección, solo lectura.' },
}
export default async function CollectorPreviewPage({ params }) {
  const { profileId } = await params
  return <PreviewClient key={profileId} profileId={profileId} />
}
