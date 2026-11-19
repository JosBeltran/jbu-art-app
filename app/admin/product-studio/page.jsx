import UnifiedStudio from './UnifiedStudio'

export default async function ProductStudio({ searchParams }) {
  const query = await searchParams
  const initialProvider = query?.provider === 'gelato' || query?.provider === 'prodigi' ? query.provider : 'all'
  return <UnifiedStudio initialProvider={initialProvider} />
}
