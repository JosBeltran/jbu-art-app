import PrintManager from './PrintManager'

export default async function Page({ searchParams }) {
  const { artwork, variant } = await searchParams
  return <PrintManager initialArtwork={typeof artwork === 'string' ? artwork : ''} initialVariant={typeof variant === 'string' ? variant : ''} />
}
