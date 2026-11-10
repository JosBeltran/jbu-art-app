import PrintManager from './PrintManager'

export default async function Page({ searchParams }) {
  const { artwork } = await searchParams
  return <PrintManager initialArtwork={typeof artwork === 'string' ? artwork : ''} />
}
