import PrintProductionQueue from './PrintProductionQueue'

export default async function Page({ searchParams }) {
  const { order, item } = await searchParams
  return <PrintProductionQueue order={typeof order === 'string' ? order : ''} item={typeof item === 'string' ? item : ''} />
}
